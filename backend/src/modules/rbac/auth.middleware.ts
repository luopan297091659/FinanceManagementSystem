import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RbacService } from './rbac.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly rbacService: RbacService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      // TODO: In production, implement token verification and user lookup
      // For now, we'll skip token verification as per the current implementation
      // Store token in request for later use if needed
      (req as any).authToken = token;
    } catch (error) {
      // Continue without authentication
    }

    next();
  }
}
