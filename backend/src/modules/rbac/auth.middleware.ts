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
      const user = await this.rbacService.verifyAuthToken(token);
      (req as any).user = { id: user.id };
    } catch (error) {
      // Continue without authentication
    }

    next();
  }
}
