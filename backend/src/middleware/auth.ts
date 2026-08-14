import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserSession } from "@shared/api";

const JWT_SECRET = process.env.JWT_SECRET || "sgreport_jwt_secret_key_2026_super_secure";
const TOKEN_EXPIRY_HOURS = Number(process.env.TOKEN_EXPIRY_HOURS) || 24;
export const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

export interface AuthRequest extends Request {
  user?: UserSession;
}

export interface TokenValidationResult {
  valid: boolean;
  user?: UserSession;
  error?: string;
}

export function generateToken(user: UserSession): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const userPayload: UserSession = {
    ...user,
    expiresAt,
  };
  const token = jwt.sign(userPayload, JWT_SECRET, {
    expiresIn: Math.floor(TOKEN_EXPIRY_MS / 1000),
  });
  return { token, expiresAt };
}

export function validateTokenDetails(token: string): TokenValidationResult {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { valid: false, error: "Token is required." };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed token structure. Must be a valid JWT." };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserSession & { exp?: number };

    if (!decoded || typeof decoded !== "object") {
      return { valid: false, error: "Invalid token payload." };
    }

    if (!decoded.email || typeof decoded.email !== "string") {
      return { valid: false, error: "Token missing email claim." };
    }

    if (!decoded.role || typeof decoded.role !== "string") {
      return { valid: false, error: "Token missing role claim." };
    }

    // Check custom 24-hour expiration timestamp
    if (decoded.expiresAt && typeof decoded.expiresAt === "number") {
      if (Date.now() > decoded.expiresAt) {
        return { valid: false, error: "Session expired. Token is older than 24 hours." };
      }
    }

    // Check standard JWT exp claim (in seconds)
    if (decoded.exp && typeof decoded.exp === "number") {
      if (Math.floor(Date.now() / 1000) >= decoded.exp) {
        return { valid: false, error: "Session expired. JWT exp timestamp exceeded." };
      }
    }

    return { valid: true, user: decoded };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { valid: false, error: "Token expired. Please sign in again." };
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return { valid: false, error: "Invalid token signature or payload format." };
    }
    return { valid: false, error: "Token verification failed." };
  }
}

export function verifyToken(token: string): UserSession | null {
  const result = validateTokenDetails(token);
  return result.valid && result.user ? result.user : null;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: "Authentication token missing. Please sign in.",
    });
  }

  const tokenParts = authHeader.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
    return res.status(401).json({
      success: false,
      error: "Malformed authorization header. Standard format: Bearer <token>",
    });
  }

  const token = tokenParts[1];
  const validation = validateTokenDetails(token);

  if (!validation.valid || !validation.user) {
    return res.status(401).json({
      success: false,
      error: validation.error || "Session expired or invalid token. Please sign in again.",
    });
  }

  req.user = validation.user;
  next();
}

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
    }

    const userRole = req.user.role || "";
    const isAdmin = userRole === "Administrator" || userRole === "Super Admin";

    if (isAdmin || allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: "Access denied. Insufficient permissions for this action.",
    });
  };
}
