import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const useSSL = process.env.MYSQL_SSL === "true";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "sivep",
  port: Number(process.env.MYSQL_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "-05:00",
  // TLS solo para BD remotas (Aiven: MYSQL_SSL=true). El MySQL local
  // normalmente no usa TLS y forzarlo rompería la conexión.
  ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

export default pool;
