#ifndef DB_CONNECTION_HPP
#define DB_CONNECTION_HPP

#include <pqxx/pqxx>
#include <string>

// Reads DATABASE_URL, strips quotes Docker --env-file leaves in the value,
// and rewrites localhost to host.docker.internal when running in a container.
std::string get_database_url();

pqxx::connection connect_to_db();

bool add_image_entry(pqxx::connection& conn, const std::string& gcs_url, double latitude, double longitude);


#endif // DB_CONNECTION_HPP