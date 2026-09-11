// learn 分区主题（dev/content-site.md §2：三分区共享组件统一接入）。
// ImageLightbox / custom.css 为三分区共享（apps/docs/theme/）；
// learn 用默认布局（无侧边栏），无分区特有组件（BackLink/ProblemList 为 gpu 分区特有）。
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import ImageLightbox from "../../../theme/ImageLightbox.vue";
import "katex/dist/katex.min.css";
import "../../../theme/custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "layout-bottom": () => h(ImageLightbox),
    });
  },
};
