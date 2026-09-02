import mongoose from "mongoose";

let isConnecting = false;

export async function connectDB(): Promise<typeof mongoose | undefined> {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sg-reports?directConnection=true";

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    return;
  }

  try {
    isConnecting = true;
    console.log(`📡 Connecting to MongoDB at ${uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}...`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB connection established successfully.");
    return mongoose;
  } catch (error) {
    console.warn("⚠️ MongoDB connection failed. Running with degraded database functionality:", error instanceof Error ? error.message : String(error));
  } finally {
    isConnecting = false;
  }
}

export function getDBStatus() {
  const states: Record<number, string> = {
    0: "Disconnected",
    1: "Connected",
    2: "Connecting",
    3: "Disconnecting",
  };
  const stateCode = mongoose.connection.readyState;
  return {
    status: states[stateCode] ?? "Unknown",
    stateCode,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}
