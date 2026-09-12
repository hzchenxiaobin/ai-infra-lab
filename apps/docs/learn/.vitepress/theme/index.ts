// learn 分区主题（dev/content-site.md §2：三分区共享组件统一接入）。
// ImageLightbox / custom.css 为三分区共享（apps/docs/theme/）；
// learn 用默认布局（无侧边栏），无分区特有组件（BackLink/ProblemList 为 gpu 分区特有）。
// NavActions：顶栏右侧主站快捷入口（仅 learn 分区接入）。
// TopicNav：顶栏中部专题导航（仅 learn 分区接入，数据来自 config.mts topicDocs）。
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import ImageLightbox from "../../../theme/ImageLightbox.vue";
import NavActions from "../../../theme/NavActions.vue";
import TopicNav from "../../../theme/TopicNav.vue";
import "katex/dist/katex.min.css";
import "../../../theme/custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "layout-bottom": () => h(ImageLightbox),
      "nav-bar-content-before": () => h(TopicNav),
      "nav-screen-content-before": () => h(TopicNav),
      "nav-bar-content-after": () => h(NavActions),
      "nav-screen-content-after": () => h(NavActions),
    });
  },
};
