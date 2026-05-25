#!/bin/bash
export LLM_PROVIDER=anthropic

# Check that ANTHROPIC_API_KEY is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set. Export it before running this script."
  echo "  export ANTHROPIC_API_KEY=sk-ant-api03-..."
  exit 1
fi

# Run
npm start -- -t "Modeling mobile ad hoc networks" -u "Context for a coding assistant" -o ./output/test3
