

import { RateLimiterRedis } from 'rate-limiter-flexible';
import type { Request, Response, NextFunction } from "express";
import { Alert } from '../utils/logger';
import { redisClient } from "../config/db";
const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    const xff = req.headers['x-forwarded-for'];
    const ipFromXff = (typeof xff === 'string' ? xff : '')?.split(",")[0]?.trim() || "";

    const ip = (typeof cfConnectingIp === 'string' ? cfConnectingIp : "") || ipFromXff || req.ip || '0.0.0.0';
    
    if(ip=="::1") return next()
    const ratelimit = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: 'rl',
        points: 10,
        duration: 10
    });
    try {
        const res = await ratelimit.consume(ip);
        return next();
    } catch (rejRes: any) {
        Alert(`the ip ${ip} has done too many requests`)
        console.log(rejRes)
        return res.status(429).json({
            error: 'Too Many Requests',
            retryAfter: rejRes.msBeforeNext,
        });
    }
}
export default rateLimiter