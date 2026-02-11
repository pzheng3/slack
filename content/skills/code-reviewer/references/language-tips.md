# Language-Specific Review Tips

## TypeScript / JavaScript
- Prefer `const` over `let`; avoid `var`
- Use strict equality (`===`) over loose (`==`)
- Prefer optional chaining (`?.`) and nullish coalescing (`??`)
- Check for proper `async/await` error handling (missing `try/catch`)
- Flag `any` types — suggest proper typing

## Python
- Follow PEP 8 conventions
- Prefer f-strings over `.format()` or `%`
- Check for mutable default arguments (`def foo(x=[])`)
- Flag bare `except:` — should catch specific exceptions
- Prefer context managers (`with`) for resource handling

## Go
- Check for unchecked `error` returns
- Prefer `errors.Is()` / `errors.As()` over string comparison
- Flag goroutine leaks (missing cancellation or done channels)
- Verify proper mutex usage for concurrent access

## React / JSX
- Check for missing `key` props in lists
- Flag unnecessary re-renders (missing `useMemo`, `useCallback`)
- Verify effect cleanup in `useEffect`
- Check for stale closures in event handlers

## SQL
- Flag unparameterized queries (SQL injection risk)
- Check for `SELECT *` in production code
- Look for missing indexes on frequently queried columns
- Verify proper use of transactions for multi-step operations

## General Security Patterns
- Never log sensitive data (passwords, tokens, PII)
- Validate and sanitize all user input at boundaries
- Use parameterized queries, never string concatenation for SQL
- Check for hardcoded secrets or credentials
