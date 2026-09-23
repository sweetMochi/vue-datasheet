<script setup lang="ts">
/**
 * 審核畫面的三區骨架：標題列 / 左欄導覽 / 主清單。
 *
 * 純排版，沒有任何狀態 —— 側欄寬度、捲動邊界、sticky 的層級都只在這裡定義一次。
 * 散到各元件裡的話，光是「側欄多寬」就會在四個地方各寫一次。
 *
 * 捲動發生在 main 內部而不是整頁：標題列與左欄要一直看得到，
 * 因為「需要你處理 N」是使用者在 300 列裡唯一的定位點。
 */
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <header class="border-line bg-surface flex h-16 shrink-0 items-center gap-4 border-b px-6">
      <slot name="header" />
    </header>

    <!--
      進度是 2px 的細線，不是畫面主角。
      粗進度條會把注意力從「哪幾個要處理」搶走，而那才是使用者要做的事
    -->
    <div class="bg-line-faint h-0.5 shrink-0">
      <slot name="progress" />
    </div>

    <div class="flex min-h-0 flex-1">
      <nav
        aria-label="欄位群組"
        class="border-line w-59 shrink-0 overflow-y-auto border-r px-4 py-5"
      >
        <slot name="rail" />
      </nav>

      <div class="flex min-w-0 flex-1 flex-col">
        <slot name="main" />
      </div>
    </div>
  </div>
</template>
