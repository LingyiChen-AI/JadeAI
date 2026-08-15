# JadeAI 出桌面客户端了：macOS / Windows，下载即用

> 下载：https://github.com/twwch/JadeAI/releases/latest
> GitHub：https://github.com/twwch/JadeAI ｜ 官网：https://jadeai.cturing.cn/zh

JadeAI 现在有桌面客户端了。不用装 Docker、不用配数据库、不用注册账号，下载装上双击就能写简历。

功能和网页版**完全一样**——50 套模板、拖拽编辑、AI 对话优化、语法检查、JD 匹配、职业照生成、模拟面试、多格式导出，一个没少。区别只是服务跑在你自己电脑上，简历存在本机，AI 用你自己的 Key。

---

## 下载

去 **[Releases 页面](https://github.com/twwch/JadeAI/releases/latest)** 挑对应你系统的包：

| 你的电脑 | 下载哪个 |
|---|---|
| Mac（M1/M2/M3/M4 等 Apple 芯片） | `JadeAI-*-mac-arm64.dmg` |
| Mac（Intel 芯片） | `JadeAI-*-mac-x64.dmg` |
| Windows 64 位 | `JadeAI-*-win-x64-setup.exe` |

> 不确定 Mac 是哪种芯片：点左上角  →「关于本机」，写 **Apple M** 选 arm64，写 **Intel** 选 x64。

---

## 安装

安装包是 ad-hoc 签名（没买 Apple 开发者证书），**第一次打开会被系统拦一下，属于正常现象**。

### macOS

把 `JadeAI.app` 拖进「应用程序」，然后在终端跑一次：

```bash
xattr -dr com.apple.quarantine /Applications/JadeAI.app
```

之后正常双击即可。

不想用终端：双击 → 被拦 → 点「完成」→ 打开**系统设置 → 隐私与安全性** → 拉到底点「仍要打开」。

> ⚠️ 别试"右键 → 打开"，macOS 15 之后苹果已经移除了这个方式，不管用。
>
> ⚠️ 如果提示的是"**已损坏**"而不是"无法验证"，说明文件没下完整，**重新下载**，别去放行。

### Windows

双击 `.exe`，SmartScreen 弹窗时点「更多信息」→「仍要运行」。当前用户安装，不需要管理员权限。

---

## 数据在哪

| 系统 | 路径 |
|---|---|
| macOS | `~/Library/Application Support/JadeAI/` |
| Windows | `%APPDATA%\JadeAI\` |

`jade.db` 就是全部简历，拷走它即是完整备份。**卸载应用不会删这个目录**，要清空数据得手动删。

---

## 更新

启动时会检查新版本，有的话右下角出现一个小提示条（不挡操作）。点「立即下载」自动下好对应你机器架构的安装包，覆盖安装即可，**数据不受影响**。

这是客户端唯一的对外请求。不想要的话，在上面那个目录的 `jade-settings.json` 里加一行 `"updateCheckEnabled": false`，重启生效。

---

## 网页版没变

需要多人共用、部署到服务器、用 PostgreSQL，还是用 Docker：

```bash
docker run -d -p 3000:3000 \
  -e AUTH_SECRET=$(openssl rand -base64 32) \
  -v jadeai-data:/app/data \
  twwch/jadeai:latest
```

自己一个人写简历，用客户端更省事。

---

项目完全开源，Apache 2.0，全部功能免费。觉得有用欢迎点个 Star：**https://github.com/twwch/JadeAI**
