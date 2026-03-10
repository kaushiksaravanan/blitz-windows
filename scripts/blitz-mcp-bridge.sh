#!/bin/bash
# Blitz MCP Bridge: stdio → HTTP forwarder for Claude Code
# Reads JSON-RPC from stdin, POSTs to Blitz's MCP server, writes response to stdout
PORT_FILE="$HOME/.blitz/mcp-port"

if [ ! -f "$PORT_FILE" ]; then
    echo '{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"Blitz is not running. Please start Blitz first."}}' >&2
    exit 1
fi

PORT=$(cat "$PORT_FILE")

while IFS= read -r line; do
    [ -z "$line" ] && continue
    response=$(curl -s -X POST "http://127.0.0.1:${PORT}/mcp" \
        -H "Content-Type: application/json" \
        -d "$line" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo '{"jsonrpc":"2.0","id":null,"error":{"code":-1,"message":"Cannot connect to Blitz. Is it running?"}}' >&2
        exit 1
    fi
    echo "$response"
done
