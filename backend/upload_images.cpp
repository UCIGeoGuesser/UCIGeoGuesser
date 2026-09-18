#include <iostream>
#include <cstdlib>
#include <filesystem>
#include <unordered_map>
#include <cmath>
#include <random>
#include <sstream>
#include <iomanip>
#include <fstream>
#include <curl/curl.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/bio.h>
#include "upload_images.hpp"
#include <nlohmann/json.hpp>
#include <vector>
#include "db/db_connection.hpp"

// ──────────────────────────────────────────────
// Small HTTP + crypto helpers backing GcsClient
// ──────────────────────────────────────────────

namespace {

size_t curl_write_cb(void* contents, size_t size, size_t nmemb, void* userp) {
    static_cast<string*>(userp)->append(static_cast<char*>(contents), size * nmemb);
    return size * nmemb;
}

// Standard base64, then made URL-safe (RFC 4648 §5) with padding stripped,
// as required for JWTs.
string base64url_encode(const unsigned char* data, size_t len) {
    int out_len = 4 * ((static_cast<int>(len) + 2) / 3);
    string encoded(out_len, '\0');
    int actual_len = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(&encoded[0]), data, static_cast<int>(len));
    encoded.resize(actual_len);
    for (auto& c : encoded) {
        if (c == '+') c = '-';
        else if (c == '/') c = '_';
    }
    while (!encoded.empty() && encoded.back() == '=') {
        encoded.pop_back();
    }
    return encoded;
}

string base64url_encode(const string& s) {
    return base64url_encode(reinterpret_cast<const unsigned char*>(s.data()), s.size());
}

// Signs `data` with the RSA private key (PEM, PKCS#1/PKCS#8) using RS256.
string rsa_sha256_sign(const string& private_key_pem, const string& data) {
    BIO* bio = BIO_new_mem_buf(private_key_pem.data(), static_cast<int>(private_key_pem.size()));
    EVP_PKEY* pkey = PEM_read_bio_PrivateKey(bio, nullptr, nullptr, nullptr);
    BIO_free(bio);
    if (!pkey) {
        cerr << "Error: failed to parse service account private key." << endl;
        return "";
    }

    EVP_MD_CTX* ctx = EVP_MD_CTX_new();
    string signature;
    if (EVP_DigestSignInit(ctx, nullptr, EVP_sha256(), nullptr, pkey) == 1) {
        size_t sig_len = 0;
        EVP_DigestSignUpdate(ctx, data.data(), data.size());
        EVP_DigestSignFinal(ctx, nullptr, &sig_len);
        signature.resize(sig_len);
        if (EVP_DigestSignFinal(ctx, reinterpret_cast<unsigned char*>(&signature[0]), &sig_len) == 1) {
            signature.resize(sig_len);
        } else {
            signature.clear();
        }
    }
    EVP_MD_CTX_free(ctx);
    EVP_PKEY_free(pkey);
    return signature;
}

// Generic HTTP request. `body` may be empty (used for GET/DELETE).
string http_request(const string& method, const string& url, const string& body,
                     const vector<string>& headers, long* out_status = nullptr) {
    CURL* curl = curl_easy_init();
    string response;
    if (!curl) return response;

    struct curl_slist* header_list = nullptr;
    for (const auto& h : headers) {
        header_list = curl_slist_append(header_list, h.c_str());
    }

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method.c_str());
    if (!body.empty()) {
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.data());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(body.size()));
    }

    CURLcode res = curl_easy_perform(curl);
    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
    if (out_status) *out_status = status;
    if (res != CURLE_OK) {
        cerr << "HTTP request failed: " << curl_easy_strerror(res) << endl;
        response.clear();
    }

    curl_slist_free_all(header_list);
    curl_easy_cleanup(curl);
    return response;
}

// Uploads raw bytes with a PUT/POST body from a file, needed for image
// uploads (kept separate from http_request since it streams from disk
// instead of building the whole body as a string first).
string http_upload_file(const string& url, const string& file_path,
                        const vector<string>& headers, long* out_status = nullptr) {
    CURL* curl = curl_easy_init();
    string response;
    if (!curl) return response;

    FILE* fp = fopen(file_path.c_str(), "rb");
    if (!fp) {
        cerr << "Error: could not open file for upload: " << file_path << endl;
        curl_easy_cleanup(curl);
        return response;
    }

    struct curl_slist* header_list = nullptr;
    for (const auto& h : headers) {
        header_list = curl_slist_append(header_list, h.c_str());
    }

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curl_write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "POST");
    curl_easy_setopt(curl, CURLOPT_READDATA, fp);

    auto file_size = filesystem::file_size(file_path);
    curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, static_cast<curl_off_t>(file_size));

    CURLcode res = curl_easy_perform(curl);
    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
    if (out_status) *out_status = status;
    if (res != CURLE_OK) {
        cerr << "HTTP upload failed: " << curl_easy_strerror(res) << endl;
        response.clear();
    }

    fclose(fp);
    curl_slist_free_all(header_list);
    curl_easy_cleanup(curl);
    return response;
}

} // namespace

// ──────────────────────────────────────────────
// GcsClient
// ──────────────────────────────────────────────

GcsClient::GcsClient() : token_uri_("https://oauth2.googleapis.com/token") {
    const char* cred_path = getenv("GOOGLE_APPLICATION_CREDENTIALS");
    if (cred_path == nullptr) {
        cerr << "Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set." << endl;
        exit(EXIT_FAILURE);
    }

    ifstream cred_file(cred_path);
    if (!cred_file) {
        cerr << "Error: could not open service account key file at " << cred_path << endl;
        exit(EXIT_FAILURE);
    }

    json cred_json = json::parse(cred_file);
    client_email_ = cred_json.value("client_email", "");
    private_key_pem_ = cred_json.value("private_key", "");
    if (cred_json.contains("token_uri")) {
        token_uri_ = cred_json["token_uri"].get<string>();
    }

    if (client_email_.empty() || private_key_pem_.empty()) {
        cerr << "Error: service account key file is missing client_email/private_key." << endl;
        exit(EXIT_FAILURE);
    }
}

string GcsClient::GetAccessToken() {
    auto now = chrono::system_clock::now();
    // Refresh a little early (60s buffer) rather than right at expiry.
    if (!cached_token_.empty() && now < (token_expiry_ - chrono::seconds(60))) {
        return cached_token_;
    }

    long iat = chrono::duration_cast<chrono::seconds>(now.time_since_epoch()).count();
    long exp = iat + 3600;

    json header = {{"alg", "RS256"}, {"typ", "JWT"}};
    json claims = {
        {"iss", client_email_},
        {"scope", "https://www.googleapis.com/auth/devstorage.read_write"},
        {"aud", token_uri_},
        {"iat", iat},
        {"exp", exp}
    };

    string signing_input = base64url_encode(header.dump()) + "." + base64url_encode(claims.dump());
    string signature = rsa_sha256_sign(private_key_pem_, signing_input);
    if (signature.empty()) {
        cerr << "Error: failed to sign JWT for GCS auth." << endl;
        return "";
    }
    string jwt = signing_input + "." + base64url_encode(signature);

    string body = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + jwt;
    long status = 0;
    string response = http_request("POST", token_uri_, body,
                                    {"Content-Type: application/x-www-form-urlencoded"}, &status);

    if (status != 200 || response.empty()) {
        cerr << "Error: token exchange failed (HTTP " << status << "): " << response << endl;
        return "";
    }

    try {
        json token_json = json::parse(response);
        cached_token_ = token_json["access_token"].get<string>();
        long expires_in = token_json.value("expires_in", 3600);
        token_expiry_ = now + chrono::seconds(expires_in);
    } catch (const std::exception& e) {
        cerr << "Error parsing token response: " << e.what() << endl;
        return "";
    }

    return cached_token_;
}

string GcsClient::UploadFile(const string& bucket, const string& object_name,
                             const string& file_path, const string& content_type) {
    string token = GetAccessToken();
    if (token.empty()) return "";

    CURL* curl_for_escape = curl_easy_init();
    char* escaped = curl_easy_escape(curl_for_escape, object_name.c_str(), 0);
    string escaped_name(escaped);
    curl_free(escaped);
    curl_easy_cleanup(curl_for_escape);

    string url = "https://storage.googleapis.com/upload/storage/v1/b/" + bucket +
                 "/o?uploadType=media&name=" + escaped_name;

    vector<string> headers = {
        "Authorization: Bearer " + token,
        "Content-Type: " + content_type
    };

    long status = 0;
    string response = http_upload_file(url, file_path, headers, &status);
    if (status < 200 || status >= 300) {
        cerr << "Error uploading file " << file_path << " (HTTP " << status << "): " << response << endl;
        return "";
    }

    // Set contentDisposition:inline to match the previous SDK behavior
    // (browsers display the image instead of downloading it).
    string patch_url = "https://storage.googleapis.com/storage/v1/b/" + bucket + "/o/" + escaped_name;
    json patch_body = {{"contentDisposition", "inline"}};
    http_request("PATCH", patch_url, patch_body.dump(),
                 {"Authorization: Bearer " + token, "Content-Type: application/json"});

    return "https://storage.googleapis.com/" + bucket + "/" + object_name;
}

bool GcsClient::DeleteObject(const string& bucket, const string& object_name) {
    string token = GetAccessToken();
    if (token.empty()) return false;

    CURL* curl_for_escape = curl_easy_init();
    char* escaped = curl_easy_escape(curl_for_escape, object_name.c_str(), 0);
    string escaped_name(escaped);
    curl_free(escaped);
    curl_easy_cleanup(curl_for_escape);

    string url = "https://storage.googleapis.com/storage/v1/b/" + bucket + "/o/" + escaped_name;
    long status = 0;
    string response = http_request("DELETE", url, "", {"Authorization: Bearer " + token}, &status);

    return status >= 200 && status < 300;
}

// ──────────────────────────────────────────────
// GCS helpers
// ──────────────────────────────────────────────

const char* initialize_bucket() {
    const char* bucket_env = std::getenv("GOOGLE_BUCKET_NAME");
    if (bucket_env == nullptr) {
      std::cerr << "Error: GOOGLE_BUCKET_NAME environment variable not set." << std::endl;
      exit(EXIT_FAILURE);
    }
    return bucket_env;
}

GcsClient initialize_gcs() {
    return GcsClient();
}

const string write_to_bucket(GcsClient& client, const string& bucket_name, const string& path, const string& object_name) {
    cout << "Uploading file: " << path << " to bucket: " << bucket_name << " with object name: " << object_name << endl;
    string object_link = client.UploadFile(bucket_name, object_name, path, "image/jpeg");
    if (object_link.empty()) {
        cerr << "Error uploading file: " << path << endl;
    } else {
        cout << "File uploaded successfully: " << object_name << endl;
    }
    cout << "Object link: " << object_link << endl;
    return object_link;
}


void delete_objects_from_bucket(GcsClient& client, const string& bucket_name, const vector<string>& object_names) {
    for (const auto& object_name : object_names) {
        cout << "Deleting object: " << object_name << " from bucket: " << bucket_name << endl;
        bool success = client.DeleteObject(bucket_name, object_name);
        if (!success) {
            cerr << "Error deleting object: " << object_name << endl;
        } else {
            cout << "Object deleted successfully: " << object_name << endl;
        }
    }
}

// ──────────────────────────────────────────────
// Upload Images
// ──────────────────────────────────────────────

void write_image_index_to_db(GcsClient& client,
                                    const string& bucket_name,
                                    const string& directory,
                                    const string& metadata_suffix) {
  
    
    if (!_valid_directory(directory)) {
        return;
    }
    auto conn = connect_to_db();
    for (const auto& entry : filesystem::directory_iterator(directory)) {
        if (!_valid_image_file(entry.path().string())) {
            continue;
        }

        // Look for the matching metadata file
        string meta_path = get_metadata_file_path(entry.path().string(), metadata_suffix);
        if (meta_path.empty()) {
            continue;
        }

        try {
            ifstream meta_file(meta_path);
            json meta_json = json::parse(meta_file);

            const string& object_name = entry.path().filename().string();
            string object_link = write_to_bucket(client, bucket_name, entry.path().string(), object_name);

            double latitude = meta_json["geoData"]["latitude"].get<double>();
            double longitude = meta_json["geoData"]["longitude"].get<double>();
            cout << "Adding image entry to DB: " << object_link << " (lat: " << latitude << ", lng: " << longitude << ")" << endl;
            add_image_entry(conn, object_link, latitude, longitude);
            
        } catch (const std::exception& e) {
            cerr << "Error reading metadata/uploading " << entry.path().filename()
                 << ": " << e.what() << endl;
        }
    }

}

std::vector<ImageEntry> get_images_for_rounds(int rounds) {
    auto conn = connect_to_db();
    std::vector<ImageEntry> images;
    try {
        pqxx::work txn(conn);
        pqxx::result res = txn.exec("SELECT gcs_url, latitude, longitude FROM images ORDER BY RANDOM() ASC LIMIT " + std::to_string(rounds));
        for (const auto& row : res) {
            ImageEntry img;
            img.gcs_url = row["gcs_url"].as<std::string>();
            img.latitude = row["latitude"].as<double>();
            img.longitude = row["longitude"].as<double>();
            images.push_back(img);
        }
    } catch (const std::exception& e) {
        cerr << "Error fetching images for rounds: " << e.what() << endl;
    }
    return images;

}

bool _valid_directory(const std::string& directory) {
    if (!std::filesystem::exists(directory) || !std::filesystem::is_directory(directory)
        || std::filesystem::is_empty(directory)) {
        std::cout << "No local images in " << directory
                  << "; skipping ingest (using images already in the database)." << std::endl;
        return false;
    }
    return true;
}

bool _valid_image_file(const std::string& file_path) {
    if (!std::filesystem::exists(file_path)) {
        std::cerr << "Error: File does not exist: " << file_path << std::endl;
        return false;
    }
    if (!std::filesystem::is_regular_file(file_path)) {
        std::cerr << "Error: Path is not a regular file: " << file_path << std::endl;
        return false;
    }
    auto ext = std::filesystem::path(file_path).extension().string();
    if (ext != ".jpg" && ext != ".jpeg") {
        std::cerr << "Error: File is not a JPEG image: " << file_path << std::endl;
        return false;
    }
    return true;
}

std::string get_metadata_file_path(const std::string& image_file_path, const std::string& metadata_suffix) {
    std::string metadata_file_path = image_file_path + "." + metadata_suffix;
    if (!std::filesystem::exists(metadata_file_path)) {
        std::cerr << "Error: Metadata file does not exist for image: " << image_file_path << std::endl;
        return "";
    }
    return metadata_file_path;
}

// ──────────────────────────────────────────────
// Game logic 
// ──────────────────────────────────────────────



int calculate_score(double user_lat, double user_lng,
                    double answer_lat, double answer_lng) {
    // Direct port of frontend score.tsx formula.
    double lat_diff = std::abs(user_lat - answer_lat);
    double lng_diff = std::abs(user_lng - answer_lng);
    double distance = std::sqrt(lat_diff * lat_diff + lng_diff * lng_diff);

    const int MAX_SCORE = 5000;
    int score;

    if (distance <= 0.00398543) {
        score = static_cast<int>(std::round(
            -MAX_SCORE * std::exp((distance - 0.005) * 650) + 5200));
    } else {
        score = static_cast<int>(std::round(
            MAX_SCORE * std::exp(-658 * (distance - 0.003))));
    }

    if (score >= 4950) {
        score = 5000;
    }
    if (score < 0) {
        score = 0;
    }

    return score;
}

string generate_session_id() {
    // Generate a random UUID-like string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    static std::random_device rd;
    static std::mt19937 gen(rd());
    static std::uniform_int_distribution<int> dist(0, 15);

    const char* hex = "0123456789abcdef";
    std::ostringstream ss;

    // 8-4-4-4-12 pattern
    const int lengths[] = {8, 4, 4, 4, 12};
    for (int g = 0; g < 5; ++g) {
        if (g > 0) ss << '-';
        for (int i = 0; i < lengths[g]; ++i) {
            ss << hex[dist(gen)];
        }
    }

    return ss.str();
}