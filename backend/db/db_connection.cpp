#include <cctype>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <pqxx/pqxx>
#include <string>

std::string get_database_url() {
    const char* db_url = std::getenv("DATABASE_URL");
    if (db_url == nullptr || db_url[0] == '\0') {
        throw std::runtime_error("DATABASE_URL environment variable not set.");
    }

    std::string url(db_url);
    auto is_quote_or_space = [](unsigned char c) {
        return c == '"' || c == '\'' || std::isspace(c);
    };
    while (!url.empty() && is_quote_or_space(static_cast<unsigned char>(url.front()))) {
        url.erase(url.begin());
    }
    while (!url.empty() && is_quote_or_space(static_cast<unsigned char>(url.back()))) {
        url.pop_back();
    }

    // Inside Docker, localhost is the container, not the host Postgres from .env.
    std::ifstream dockerenv("/.dockerenv");
    if (dockerenv.good()) {
        const std::string docker_host = "host.docker.internal";
        for (const std::string& local_host : {"localhost", "127.0.0.1"}) {
            const std::string from = "@" + local_host;
            auto pos = url.find(from);
            if (pos != std::string::npos) {
                url.replace(pos + 1, local_host.size(), docker_host);
                break;
            }
        }
    }

    return url;
}

pqxx::connection connect_to_db() {
    return pqxx::connection(get_database_url());
}

bool add_image_entry(pqxx::connection& conn, const std::string& gcs_url, double latitude, double longitude) {
    try {
        pqxx::work txn(conn);
        txn.exec(
            "INSERT INTO images (gcs_url, latitude, longitude) "
            "VALUES ($1, $2, $3);",
            {gcs_url, latitude, longitude}
        );
        txn.commit();
        return true;
    } catch (const std::exception &e) {
        std::cerr << "Error adding image entry: " << e.what() << std::endl;
        return false;
    }
}

