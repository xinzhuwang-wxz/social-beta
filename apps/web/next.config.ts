import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 工作区内的 @pool/* 包直接发布 .ts 源码，没有预编译产物。
  // Next 的打包器默认只转译 node_modules 之外的应用代码，不加这条会在解析
  // workspace 包时报 Module not found。
  //
  // 这里曾经还有一段 webpack extensionAlias 配置：包里的相对 import 写着 .js
  // 后缀（TS 的 ESM 惯例），而 Turbopack 没有 extensionAlias 的等价物，
  // 于是整个项目只能退回 --webpack —— Next 16 里那是弃用轨道。
  // 后来把 .js 后缀删掉了：那个后缀买的是「将来用 tsc 编成 Node ESM」的期权，
  // 而我们没有这个计划，却为它付了整个项目的 Turbopack 期权费。
  // 真要发布这些包时再加构建产物，那时有明确理由，而不是现在为一个假设付费。
  transpilePackages: ['@pool/shared', '@pool/db', '@pool/model', '@pool/engine'],
}

export default nextConfig
