<script setup lang="ts"></script>

<template>
  <RouterView />
  <!-- 全局 CRT 扫描线叠加层：放在最外层，保证盖住所有视图且不拦截点击 -->
  <div class="crt" aria-hidden="true" />
</template>
