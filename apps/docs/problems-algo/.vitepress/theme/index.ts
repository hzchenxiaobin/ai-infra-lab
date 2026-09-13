// algo 分区主题（dev/content-site.md §2：leetcode 组件拷入 + 适配新 URL 布局）。
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import SolutionList from "./SolutionList.vue";
import ContestList from "./ContestList.vue";
import BackLink from "./BackLink.vue";
import ImageLightbox from "../../../theme/ImageLightbox.vue";
import { installNewTabLinks } from "../../../theme/newTabLinks";
import "katex/dist/katex.min.css";
import "../../../theme/custom.css";

installNewTabLinks();

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("SolutionList", SolutionList);
    app.component("ContestList", ContestList);
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "doc-before": () => h(BackLink),
      "layout-bottom": () => h(ImageLightbox),
    });
  },
};
