// GPU 分区主题（dev/content-site.md §2：leetgpu 组件拷入 + 适配新 URL 布局）。
// ImageLightbox / custom.css 为三分区共享（apps/docs/theme/）；
// BackLink / ProblemList 为分区特有（路由模式与数据加载各分区不同）。
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import ProblemList from "./ProblemList.vue";
import BackLink from "./BackLink.vue";
import ImageLightbox from "../../../theme/ImageLightbox.vue";
import "katex/dist/katex.min.css";
import "../../../theme/custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("ProblemList", ProblemList);
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "doc-before": () => h(BackLink),
      "layout-bottom": () => h(ImageLightbox),
    });
  },
};
