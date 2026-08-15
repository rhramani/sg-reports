import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env") });
dotenv.config();

import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { UserModel } from "./models/User";
import { generateToken } from "./middleware/auth";

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL || "goldshrddha@gmail.com";
  const password = process.env.SUPER_ADMIN_PASSWORD || "goldshrddha@5876";
  const name = process.env.SUPER_ADMIN_NAME || "SG Super Admin";

  if (!password) {
    console.error("❌ SUPER_ADMIN_PASSWORD environment variable is not set. Aborting.");
    process.exit(1);
  }

  console.log("🚀 Initializing Super Admin MongoDB generation script...");
  await connectDB();

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await UserModel.findOneAndUpdate(
      { email },
      {
        name,
        email,
        password: hashedPassword,
        role: "Super Admin",
        status: "Active" as const,
        lastActive: "Active now",
      },
      { upsert: true, new: true }
    );

    const { token, expiresAt } = generateToken({
      email: user.email,
      name: user.name,
      role: user.role,
      authenticatedAt: new Date().toISOString(),
    });

    console.log("\n==================================================");
    console.log("   ✅ SUPER ADMIN CREDENTIALS GENERATED IN MONGODB");
    console.log("==================================================");
    console.log(` 📧 Email:     ${user.email}`);
    console.log(` 🛡️  Role:      ${user.role}`);
    console.log(` 👤 Name:      ${user.name}`);
    console.log(` 🆔 Mongo ID:  ${user._id}`);
    console.log("--------------------------------------------------");
    console.log(` 🎫 JWT Token (24h validity):\n${token}`);
    console.log(` ⏳ Expires At: ${new Date(expiresAt).toLocaleString()}`);
    console.log("==================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to generate Super Admin in MongoDB:", error);
    process.exit(1);
  }
}

seedSuperAdmin();
