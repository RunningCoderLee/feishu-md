#!/bin/bash
set -e

INSTALL_DIR="/usr/local/bin"
BIN_NAME="feishu-md"

echo "🚀 安装飞书文档转 Markdown 工具..."
echo ""

# 定位到项目目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 bun 是否安装
if ! command -v bun &> /dev/null; then
    echo "❌ 需要 bun 来编译项目，正在自动安装..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# 安装依赖（如果 node_modules 不存在）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    if command -v pnpm &> /dev/null; then
        pnpm install
    elif command -v npm &> /dev/null; then
        npm install
    else
        bun install
    fi
fi

# 编译为独立二进制
echo "📦 编译二进制..."
mkdir -p dist-bin
bun build src/index.ts --compile --outfile dist-bin/$BIN_NAME && rm -f .*.bun-build

if [ ! -f "dist-bin/$BIN_NAME" ]; then
    echo "❌ 编译失败"
    exit 1
fi

# 安装到 /usr/local/bin
echo "📥 安装到 $INSTALL_DIR/$BIN_NAME..."
mkdir -p "$INSTALL_DIR"

if [ -w "$INSTALL_DIR" ]; then
    cp dist-bin/$BIN_NAME "$INSTALL_DIR/$BIN_NAME"
    chmod +x "$INSTALL_DIR/$BIN_NAME"
else
    sudo cp dist-bin/$BIN_NAME "$INSTALL_DIR/$BIN_NAME"
    sudo chmod +x "$INSTALL_DIR/$BIN_NAME"
fi

echo ""
echo "✅ 安装成功!"
echo ""
echo "📝 使用: $BIN_NAME"
echo "🗑️  卸载: rm $INSTALL_DIR/$BIN_NAME"
