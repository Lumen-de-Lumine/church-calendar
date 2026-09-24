// roman-catholic-church-calendar — a zero-dependency TypeScript port of the
// Ruby `church-calendar-api` 2.7.0 service and the `calendarium-romanum`
// library it stands on.
//
//   * `roman-catholic-church-calendar/core` — the liturgical computation (port of the gem)
//   * `roman-catholic-church-calendar/api`  — repository, facade, serializers (port of lib/ + entities)
//   * `roman-catholic-church-calendar/http` — the router and its adapters (port of Grape + Roda + config.ru)
//
// This entry point re-exports all three.

export * from './core/index.js';
export * from './api/index.js';
export * from './http/index.js';
