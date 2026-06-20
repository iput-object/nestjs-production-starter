import { SetMetadata } from '@nestjs/common';

export const OPTIONAL_AUTH_KEY = 'optional_auth';

/**
 * Marks a route as optionally authenticated.
 *
 * When combined with `JwtAuthGuard`:
 * - A valid token populates `request.user` as usual.
 * - No token at all is allowed through with `user` undefined (anonymous).
 * - A token that is present but invalid (expired, malformed, bad signature)
 *   is still rejected with 401, so clients surface auth bugs instead of
 *   silently degrading to anonymous.
 *
 * @example
 *   @UseGuards(JwtAuthGuard)
 *   @OptionalAuth()
 *   @Get('feed')
 *   getFeed(@CurrentUser() user?: JwtPayload) {
 *     return this.service.feed(user); // user is undefined for anonymous callers
 *   }
 */

export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
