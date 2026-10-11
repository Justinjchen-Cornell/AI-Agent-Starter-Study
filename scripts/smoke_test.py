"""免启动服务器的快速验证脚本：直接在终端跑一次主智能体。

用法（在项目根目录执行）：
    python scripts/smoke_test.py

需先配置好 .env（LLM 与 Tavily 密钥）。
"""
import sys
from pathlib import Path

# 把项目根目录加入模块搜索路径（原因详见 docs/lessons 第 1 课，
# 与 api/server.py 中的修复同理：脚本所在目录不等于项目根目录）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
from agent.main_agent import run_deep_agent


async def main():
    print("=== E2E START ===", flush=True)
    await run_deep_agent(
        "Search the web for the latest developments in AI agents in 2025, then summarize briefly",
        "smoke_test_001",
    )
    print("=== E2E DONE ===", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
