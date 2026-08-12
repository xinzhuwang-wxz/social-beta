import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 工作区内的 @pool/* 包直接发布 .ts 源码（无预编译产物），import 路径里
  // 又写的是 .js 后缀（TS 的 ESM 惯例，为将来若真的 tsc 编译成 Node ESM 铺路）。
  // Next 的打包器默认只转译 node_modules 之外的代码，不加这条会在解析 workspace
  // 包时报 "Module not found: ./xxx.js"。
  transpilePackages: ["@pool/shared", "@pool/db", "@pool/model", "@pool/engine"],
  // 光转译还不够：webpack 的解析器看到字面量 './types.js' 只会去找真的叫
  // types.js 的文件，不知道要去试 .ts —— 这正是 TS 官方推荐的「源码写 .js
  // 后缀指向 .ts 文件」写法在打包器这一侧唯一缺的一块拼图，extensionAlias
  // 就是 webpack 官方给这个场景的解法。
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
