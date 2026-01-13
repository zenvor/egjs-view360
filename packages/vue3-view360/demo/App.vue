<script lang="ts">
import { defineComponent } from "vue";
import WideAngleDemo from "./WideAngleDemo.vue";

export default defineComponent({
  name: "App",
  components: {
    WideAngleDemo
  }
});
</script>

<template>
  <WideAngleDemo />
</template>

<style>
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
