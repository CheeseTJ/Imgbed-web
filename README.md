<div align="center">
  <h1>Imgbed · Web</h1>
  <p>自托管图床前端 · Vue 3 + Vite + TypeScript，支持拖拽直传与文件夹管理</p>
</div>

<div align="center">

![Vue](https://img.shields.io/badge/Vue-3-42b883)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

## 项目定位

自托管图床的**前端**，配套后端是 [Imgbed-api](https://github.com/CheeseTJ/Imgbed-api)。
一个单页应用：登录后进入图库，支持拖拽上传、文件夹树、批量操作、回收站。

```text
Imgbed-web (本仓库)  ──fetch /api/*──>  Imgbed-api (Go + Gin)  ──> R2 + MySQL
```

## 功能

- **上传** —— 拖拽区 + 队列面板，批量上传带进度与失败重试
- **图库** —— 瀑布/表格视图、分页、按文件夹筛选、搜索
- **文件夹树** —— 左侧树形导航，支持新建、重命名、批量迁移
- **检查器** —— 单图详情：尺寸、体积、格式、外链、私有访问
- **回收站** —— 查看与还原软删除的图片
- **鉴权** —— 登录态来自统一身份中心（JWT），前端只负责携带

## 快速开始

```bash
npm install
npm run dev          # 开发服务器，默认代理到后端
```

构建：

```bash
npm run build        # 产物在 dist/
npm run preview      # 本地预览构建结果
```

### 后端地址

由 `VITE_API_BASE` 控制（见 `.env.production`）。开发态走 `vite.config.ts` 里的代理，
生产态直连后端域名。

```bash
# .env.production
VITE_API_BASE=https://imgbed.example.com
```

## 目录结构

```text
src/
  api/           后端接口封装（client / upload / ucenter）
  stores/        Pinia 状态：gallery、auth
  components/    AppShell、DropZone、UploadQueue、FolderTree、
                 ImageTable、Inspector、ConfirmDialog
  views/         LibraryView（主图库）、LoginView
  router/        路由
  utils/         格式化工具
  types.ts       与后端对齐的类型定义
```

## 技术取舍

- **组合式 API + Pinia**，状态集中在 `stores/`，组件不持有跨页数据
- **上传与列表解耦**：上传队列独立于图库列表，上传完成后按需刷新
- **类型与后端对齐**：`types.ts` 手工维护，后端改字段时同步改这里
- **无 UI 框架**：样式手写，避免为一个控制台引入整套组件库

## License

[MIT](./LICENSE) © 2026 JuneT
