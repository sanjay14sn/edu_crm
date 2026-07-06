import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { assertFeature, CenterFeatureFlag } from '../utils/centerPolicy';

export function requireCenterFeature(flag: CenterFeatureFlag) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const result = await assertFeature(req.user?.tenantId, flag, req.user?.role);
    if (!result.ok) {
      return res.status(403).json({
        message: result.message,
        code: 'FEATURE_DISABLED',
        feature: flag,
      });
    }
    next();
  };
}
