import pg from "pg";
import env from "dotenv";

env.config();

const { Pool } = pg;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true, // ✅ Best for Neon
});

db.connect()
  .then(() => console.log("✅ Connected to Neon via Pool!"))
  .catch((err) => console.error("❌ Connection error:", err));

export default db;