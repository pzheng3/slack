#!/usr/bin/env bash
# search-summary.sh — Quick web search helper
# Usage: ./search-summary.sh "query terms"
#
# This script is a placeholder demonstrating how skills can bundle
# executable scripts. In production, this would integrate with a
# search API (e.g., Tavily, Serper, Google Custom Search).
#
# The AI agent can execute this script or use its built-in web search
# tool — whichever is available in the current environment.

set -euo pipefail

QUERY="${1:?Usage: $0 \"search query\"}"

echo "=== Web Research: ${QUERY} ==="
echo ""
echo "Search API not configured. The agent should use its built-in"
echo "web_search tool or web_search_preview capability instead."
echo ""
echo "To enable this script, set SEARCH_API_KEY and configure the"
echo "search provider in this script."
