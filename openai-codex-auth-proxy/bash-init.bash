# 这是兼容入口。
#
# 旧版本会让 `~/.bash_profile` 直接 `source` 本文件。
# 新版本已经统一改为：
# `source "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash"`
#
# 为了不让已经接入的环境立即失效，这里保留一个薄兼容层：
# 只做一件事，把控制权转交给统一 `bootstrap` 入口。

__openclaw_openai_codex_auth_proxy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__openclaw_local_overrides_bootstrap="${__openclaw_openai_codex_auth_proxy_dir}/../bootstrap/bash-init.bash"

if [[ -f "${__openclaw_local_overrides_bootstrap}" ]]; then
  # shellcheck source=/dev/null
  source "${__openclaw_local_overrides_bootstrap}"
fi
