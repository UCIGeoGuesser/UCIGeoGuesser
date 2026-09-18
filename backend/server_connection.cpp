#include "crow.h"
#include "crow/middlewares/cors.h"
#include <map>
#include <unordered_map>
#include <string>
#include <fstream>
#include <sstream>
#include <mutex>
#include <random>
#include <algorithm>
#include <numeric>
#include <chrono>
#include <iostream>
#include "upload_images.cpp"
#include "db/db_connection.hpp"
#include <pqxx/pqxx>

// ──────────────────────────────────────────────
// Global state
// ──────────────────────────────────────────────

// Pre-loaded image index (populated once at startup)
static string g_db_connection_string;

// Active game sessions (protected by mutex for thread safety)
static std::unordered_map<string, GameSession> g_sessions;
static std::mutex g_sessions_mutex;

// Session timeout: 10 minutes
static constexpr auto SESSION_TIMEOUT = std::chrono::minutes(10);



// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

// Remove sessions older than SESSION_TIMEOUT. Call under lock.
static void cleanup_expired_sessions() {
    auto now = std::chrono::steady_clock::now();
    for (auto it = g_sessions.begin(); it != g_sessions.end(); ) {
        if (now - it->second.created_at > SESSION_TIMEOUT) {
            cout << "Cleaning up expired session: " << it->first << endl;
            it = g_sessions.erase(it);
        } else {
            ++it;
        }
    }
}



int main() {
    using namespace std;

    

    /* Initialize the Crow app with CORS support */
    crow::App<crow::CORSHandler> app;
    auto& cors = app.get_middleware<crow::CORSHandler>().global();
    cors.origin("*")
        .methods("GET"_method, "POST"_method, "OPTIONS"_method)
        .headers("Content-Type", "ngrok-skip-browser-warning", "Authorization");

    /* Constants */
    const int MAX_ROUNDS = 25;

    /* Initialize database connection */
    try {
        g_db_connection_string = get_database_url();
    } catch (const std::exception& e) {
        cerr << "FATAL: " << e.what() << endl;
        return 1;
    }

    /* ───────────────────────────────────────
       GET /api/health_check
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/health_check").methods("GET"_method)([]() {
        crow::json::wvalue res;
        res["status"] = "ok";
        return crow::response(200, res);
    });

    /* ───────────────────────────────────────
       POST /api/challenges
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/challenges").methods("POST"_method)([MAX_ROUNDS](const crow::request& req){
        crow::json::wvalue res;
        auto data = crow::json::load(req.body);
        int requested_rounds = 5; 
        if (data && data.has("totalRounds") && data["totalRounds"].t() == crow::json::type::Number) {
            requested_rounds = data["totalRounds"].i();
        }
        if (requested_rounds <= 0) requested_rounds = 1;
        if (requested_rounds > MAX_ROUNDS) requested_rounds = MAX_ROUNDS;

        auto images_entries = get_images_for_rounds(requested_rounds);
        if (images_entries.empty()) {
            res["error"] = "No images available in the database";
            return crow::response(503, res);
        }
        try {
            pqxx::connection conn(g_db_connection_string);
            pqxx::work txn(conn);

            pqxx::result res_challenge = txn.exec(
                "INSERT INTO public.challenges DEFAULT VALUES RETURNING id;"
            );
            string challenge_id = res_challenge[0]["id"].as<string>();

            for (int i = 0; i < static_cast<int>(images_entries.size()); ++i) {
                const auto& img = images_entries[i];
                txn.exec(
                    "INSERT INTO public.challenge_images (challenge_id, image_url, latitude, longitude, display_order) "
                    "VALUES ($1, $2, $3, $4, $5);",
                    {challenge_id, img.gcs_url, img.latitude, img.longitude, i + 1}
                );
            }

            txn.commit();

            res["challengeId"] = challenge_id;
            res["totalRounds"] = requested_rounds;
            return crow::response(201, res);

        } catch (const std::exception& e) {
            cerr << "DB Error in POST /api/challenges: " << e.what() << endl;
            res["error"] = "Internal database error";
            return crow::response(500, res);
        }
    });

    /* ───────────────────────────────────────
       GET /api/challenges/<uuid> (1v1 Endpoint)
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/challenges/<string>").methods("GET"_method)([](const string& challenge_id) {
        crow::json::wvalue res;

        try {
            pqxx::connection conn(g_db_connection_string);
            pqxx::read_transaction txn(conn);

            pqxx::result img_res = txn.exec(
                "SELECT display_order, image_url FROM public.challenge_images "
                "WHERE challenge_id = $1 ORDER BY display_order ASC;",
                pqxx::params{challenge_id}
            );

            if (img_res.empty()) {
                res["error"] = "Challenge not found";
                return crow::response(404, res);
            }

            vector<crow::json::wvalue> images_array;
            for (auto row : img_res) {
                crow::json::wvalue img_obj;
                img_obj["displayOrder"] = row["display_order"].as<int>();
                img_obj["imageUrl"] = row["image_url"].as<string>();
                images_array.push_back(std::move(img_obj));
            }

            pqxx::result attempt_res = txn.exec(
                "SELECT role, total_score, completed_at FROM public.challenge_attempts "
                "WHERE challenge_id = $1;",
                pqxx::params{challenge_id}
            );

            crow::json::wvalue attempts_obj;
            attempts_obj["creator"] = crow::json::wvalue(nullptr);
            attempts_obj["invitee"] = crow::json::wvalue(nullptr);

            for (auto row : attempt_res) {
                string role = row["role"].as<string>();
                crow::json::wvalue att;
                att["completed"] = !row["completed_at"].is_null();
                if (!row["total_score"].is_null()) {
                    att["totalScore"] = row["total_score"].as<int>();
                }
                attempts_obj[role] = std::move(att);
            }

            res["challengeId"] = challenge_id;
            res["totalRounds"] = static_cast<int>(images_array.size());
            res["images"] = std::move(images_array);
            res["attempts"] = std::move(attempts_obj);

            return crow::response(200, res);

        } catch (const std::exception& e) {
            string msg = e.what();
            if (msg.find("invalid input syntax") != string::npos) {
                res["error"] = "Challenge not found";
                return crow::response(404, res);
            }
            cerr << "DB Error in GET /api/challenges/{id}: " << e.what() << endl;
            res["error"] = "Internal database error";
            return crow::response(500, res);
        }
    });

    /* ───────────────────────────────────────
       POST /api/challenges/<uuid>/attempts (1v1 Endpoint)
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/challenges/<string>/attempts").methods("POST"_method)([](const crow::request& req, const string& challenge_id) {
        crow::json::wvalue res;
        auto data = crow::json::load(req.body);

        if (!data || !data.has("role") || !data.has("guesses")) {
            res["error"] = "Missing role or guesses";
            return crow::response(400, res);
        }

        string role = data["role"].s();
        if (role != "creator" && role != "invitee") {
            res["error"] = "Invalid role. Must be 'creator' or 'invitee'";
            return crow::response(400, res);
        }

        try {
            pqxx::connection conn(g_db_connection_string);
            pqxx::work txn(conn);

            pqxx::result img_res = txn.exec(
                "SELECT display_order, latitude, longitude FROM public.challenge_images "
                "WHERE challenge_id = $1 ORDER BY display_order ASC;",
                pqxx::params{challenge_id}
            );

            if (img_res.empty()) {
                res["error"] = "Challenge not found";
                return crow::response(404, res);
            }

            std::map<int, std::pair<double, double>> answers;
            for (auto row : img_res) {
                answers[row["display_order"].as<int>()] = 
                    {row["latitude"].as<double>(), row["longitude"].as<double>()};
            }

            const auto& guesses_json = data["guesses"];
            if (guesses_json.t() != crow::json::type::List) {
                res["error"] = "Guesses must be a list";
                return crow::response(400, res);
            }

            int total_score = 0;
            vector<crow::json::wvalue> round_breakdowns;

            for (const auto& guess : guesses_json) {
                if (guess.t() != crow::json::type::Object ||
                    !guess.has("displayOrder") || !guess.has("lat") || !guess.has("lng")) {
                    res["error"] = "Each guess needs displayOrder, lat, and lng";
                    return crow::response(400, res);
                }
                int display_order = guess["displayOrder"].i();
                double user_lat = guess["lat"].d();
                double user_lng = guess["lng"].d();

                if (answers.find(display_order) == answers.end()) continue;

                auto target = answers[display_order];
                int round_score = calculate_score(user_lat, user_lng, target.first, target.second);
                total_score += round_score;

                crow::json::wvalue rb;
                rb["displayOrder"] = display_order;
                rb["score"] = round_score;
                rb["answerLat"] = target.first;
                rb["answerLng"] = target.second;
                round_breakdowns.push_back(std::move(rb));
            }

            txn.exec(
                "INSERT INTO public.challenge_attempts (challenge_id, role, total_score, completed_at) "
                "VALUES ($1, $2, $3, CURRENT_TIMESTAMP);",
                {challenge_id, role, total_score}
            );

            txn.commit();

            res["success"] = true;
            res["totalScore"] = total_score;
            res["roundBreakdowns"] = std::move(round_breakdowns);
            return crow::response(200, res);

        } catch (const pqxx::unique_violation&) {
            res["error"] = "An attempt for this role has already been submitted.";
            return crow::response(409, res);
        } catch (const std::exception& e) {
            string msg = e.what();
            if (msg.find("invalid input syntax") != string::npos) {
                res["error"] = "Challenge not found";
                return crow::response(404, res);
            }
            cerr << "DB Error in POST /api/challenges/{id}/attempts: " << e.what() << endl;
            res["error"] = "Internal database error";
            return crow::response(500, res);
        }
    });

    /* ───────────────────────────────────────
       POST /api/start_game
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/start_game").methods("POST"_method)
    ([MAX_ROUNDS](const crow::request& req) {
        crow::json::wvalue res;
        auto data = crow::json::load(req.body);

        if (!data) {
            res["error"] = "Malformed JSON payload";
            return crow::response(400, res);
        }

        if (!data.has("totalRounds") || data["totalRounds"].t() != crow::json::type::Number) {
            res["error"] = "Invalid totalRounds value";
            return crow::response(400, res);
        }

        int requested_rounds = data["totalRounds"].i();
        if (requested_rounds <= 0) requested_rounds = 1;
        if (requested_rounds > MAX_ROUNDS) requested_rounds = MAX_ROUNDS;

        auto images_entries = get_images_for_rounds(requested_rounds);
        if (images_entries.empty()) {
            res["error"] = "No images available in the database";
            return crow::response(503, res);
        }

        GameSession session;
        session.session_id = generate_session_id();
        session.current_round = 0;
        session.total_score = 0;
        session.created_at = std::chrono::steady_clock::now();

        for (const auto& img : images_entries) {
            RoundData rd;
            rd.image_id = img.id;
            rd.gcs_url = img.gcs_url;
            rd.answer_lat = img.latitude;
            rd.answer_lng = img.longitude;
            rd.submitted = false;
            rd.score = 0;
            session.rounds.push_back(rd);
        }

        string sid = session.session_id;
        string first_image_url = session.rounds[0].gcs_url;

        {
            std::lock_guard<std::mutex> lock(g_sessions_mutex);
            cleanup_expired_sessions();
            g_sessions[sid] = std::move(session);
        }

        res["sessionId"] = sid;
        res["totalRounds"] = requested_rounds;
        res["round"] = 1;
        res["imageUrl"] = first_image_url;

        cout << "Game started: session=" << sid
             << " rounds=" << requested_rounds << endl;

        return crow::response(200, res);
    });

    /* ───────────────────────────────────────
       POST /api/get_round
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/get_round").methods("POST"_method)
    ([](const crow::request& req) {
        crow::json::wvalue res;
        auto data = crow::json::load(req.body);

        if (!data || !data.has("sessionId")) {
            res["error"] = "Missing sessionId";
            return crow::response(400, res);
        }

        string sid = data["sessionId"].s();

        std::lock_guard<std::mutex> lock(g_sessions_mutex);
        auto it = g_sessions.find(sid);
        if (it == g_sessions.end()) {
            res["error"] = "Session not found or expired";
            return crow::response(404, res);
        }

        auto& session = it->second;
        int round_idx = session.current_round;

        if (round_idx >= static_cast<int>(session.rounds.size())) {
            res["error"] = "Game is already over";
            res["gameOver"] = true;
            res["totalScore"] = session.total_score;
            return crow::response(200, res);
        }

        const auto& round = session.rounds[round_idx];
        res["round"] = round_idx + 1;
        res["totalRounds"] = static_cast<int>(session.rounds.size());
        res["imageUrl"] = round.gcs_url;

        return crow::response(200, res);
    });

    /* ───────────────────────────────────────
       POST /api/submit_guess
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/submit_guess").methods("POST"_method)
    ([](const crow::request& req) {
        crow::json::wvalue res;
        auto data = crow::json::load(req.body);

        if (!data || !data.has("sessionId") ||
            !data.has("lat") || !data.has("lng")) {
            res["error"] = "Missing sessionId, lat, or lng";
            return crow::response(400, res);
        }

        string sid = data["sessionId"].s();
        double user_lat = data["lat"].d();
        double user_lng = data["lng"].d();

        std::lock_guard<std::mutex> lock(g_sessions_mutex);
        auto it = g_sessions.find(sid);
        if (it == g_sessions.end()) {
            res["error"] = "Session not found or expired";
            return crow::response(404, res);
        }

        auto& session = it->second;
        int round_idx = session.current_round;

        if (round_idx >= static_cast<int>(session.rounds.size())) {
            res["error"] = "Game is already over";
            res["gameOver"] = true;
            res["totalScore"] = session.total_score;
            return crow::response(200, res);
        }

        auto& round = session.rounds[round_idx];
        if (round.submitted) {
            res["error"] = "This round was already submitted";
            return crow::response(400, res);
        }

        int score = calculate_score(user_lat, user_lng,
                                    round.answer_lat, round.answer_lng);
        round.score = score;
        round.submitted = true;
        session.total_score += score;
        session.current_round++;

        bool game_over = (session.current_round >=
                          static_cast<int>(session.rounds.size()));

        res["score"] = score;
        res["answerLat"] = round.answer_lat;
        res["answerLng"] = round.answer_lng;
        res["totalScore"] = session.total_score;
        res["round"] = round_idx + 1;
        res["gameOver"] = game_over;

        cout << "Guess submitted: session=" << sid
             << " round=" << (round_idx + 1)
             << " score=" << score
             << " total=" << session.total_score
             << " gameOver=" << game_over << endl;

        return crow::response(200, res);
    });

    /* ───────────────────────────────────────
       POST /api/skip_round
       ─────────────────────────────────────── */
    CROW_ROUTE(app, "/api/skip_round").methods("POST"_method)
    ([](const crow::request& req) {
        crow::json::wvalue res;
        auto data = crow::json::load(req.body);

        if (!data || !data.has("sessionId")) {
            res["error"] = "Missing sessionId";
            return crow::response(400, res);
        }

        string sid = data["sessionId"].s();

        std::lock_guard<std::mutex> lock(g_sessions_mutex);
        auto it = g_sessions.find(sid);
        if (it == g_sessions.end()) {
            res["error"] = "Session not found or expired";
            return crow::response(404, res);
        }

        auto& session = it->second;
        int round_idx = session.current_round;

        if (round_idx >= static_cast<int>(session.rounds.size())) {
            res["error"] = "Game is already over";
            res["gameOver"] = true;
            res["totalScore"] = session.total_score;
            return crow::response(200, res);
        }

        auto& round = session.rounds[round_idx];
        if (round.submitted) {
            res["error"] = "This round was already submitted";
            return crow::response(400, res);
        }

        round.score = 0;
        round.submitted = true;
        session.current_round++;

        bool game_over = (session.current_round >=
                          static_cast<int>(session.rounds.size()));

        res["score"] = 0;
        res["answerLat"] = round.answer_lat;
        res["answerLng"] = round.answer_lng;
        res["totalScore"] = session.total_score;
        res["round"] = round_idx + 1;
        res["gameOver"] = game_over;

        cout << "Round skipped: session=" << sid
             << " round=" << (round_idx + 1)
             << " gameOver=" << game_over << endl;

        return crow::response(200, res);
    });

    char* port_env = std::getenv("PORT");
    int port = (port_env != nullptr) ? std::stoi(port_env) : 18080;
    app.port(port).multithreaded().run();
}
