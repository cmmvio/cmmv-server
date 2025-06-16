# Changelog

## v0.13.0 - 2025-06-14
### Added
- Proxy module supports hooks similar to `express-http-proxy`.
- Additional tests for proxy, multer and event streams.
- `vitest` integration for testing.
- Server handles `OPTIONS` only for registered routes.

### Fixed
- Proxy now detects transport protocol correctly.
- Fixed request query getter.
- Assorted test fixes and cleanup.

