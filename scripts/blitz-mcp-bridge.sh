#!/bin/bash
# Blitz MCP Bridge: stdio → HTTP forwarder for Claude Code
# Reads JSON-RPC from stdin, POSTs to Blitz's MCP server, writes response to stdout
PORT_FILE="$HOME/.blitz/mcp-port"

# Wait up to 10 seconds for Blitz to start and write the port file
WAITED=0
while [ ! -f "$PORT_FILE" ] && [ "$WAITED" -lt 10 ]; do
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ ! -f "$PORT_FILE" ]; then
    echo '{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"Blitz is not running. Please start Blitz first."}}' >&2
    exit 1
fi

PORT=$(cat "$PORT_FILE")

# Wait up to 5 more seconds for the HTTP server to accept connections
WAITED=0
while ! curl -s -o /dev/null -w '' "http://127.0.0.1:${PORT}/mcp" 2>/dev/null && [ "$WAITED" -lt 5 ]; do
    sleep 1
    WAITED=$((WAITED + 1))
done

while IFS= read -r line; do
    [ -z "$line" ] && continue

    # Notifications (no "id" field) don't expect a response in MCP protocol.
    # Still forward to server but discard the HTTP response to avoid
    # injecting unexpected lines into the stdout stream.
    case "$line" in
        *'"id"'*) ;; # has id — normal request, will echo response below
        *)
            curl -s -o /dev/null -X POST "http://127.0.0.1:${PORT}/mcp" \
                -H "Content-Type: application/json" \
                --max-time 5 -d "$line" 2>/dev/null
            continue
            ;;
    esac

    response=$(curl -s --max-time 120 -X POST "http://127.0.0.1:${PORT}/mcp" \
        -H "Content-Type: application/json" \
        -d "$line" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo '{"jsonrpc":"2.0","id":null,"error":{"code":-1,"message":"Cannot connect to Blitz. Is it running?"}}' >&2
        exit 1
    fi
    echo "$response"
done
