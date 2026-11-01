import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export function createToken(payload: {
    userId: number;
    organizationId: number;
}) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: "1d",
    });
}

export function verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET);
}

