# 这是 `local-overrides` 的统一 Bash 接入入口。
#
# 设计目标：
# 1. `~/.bash_profile` 里永远只保留这一条 `source`
# 2. 所有覆盖模块共用同一种接入方式
# 3. 具体模块的匹配与执行留给统一的 Node preload 路由层
#
# 当前实现中，这个入口会给所有 `openclaw` 命令统一注入：
# `NODE_OPTIONS=--import=<runtime>/bootstrap/node-preload-entry.mjs`
#
# 然后由 `node-preload-entry.mjs` 自己判断：
# - 当前命令是否命中某个模块
# - 哪些模块需要真正激活

if [[ -n "${__OPENCLAW_LOCAL_OVERRIDES_BOOTSTRAP_LOADED:-}" ]]; then
  return 0
fi
__OPENCLAW_LOCAL_OVERRIDES_BOOTSTRAP_LOADED=1

# 这里要同时区分两层目录：
# 1. `runtimeRoot`
#    真实运行时目录，里面只有 `bootstrap/`、`config/`、`modules/`
# 2. `repoRoot`
#    工程仓库根目录，里面还会有 `test/`、`docs/`、`.github/`
#
# `~/.openclaw/local-overrides` 会软链接到 `runtimeRoot`，
# 所以运行时代码必须围绕 `runtimeRoot` 来推导路径，
# 不能再假设仓库根和运行时根是同一个目录。
__openclaw_local_overrides_bootstrap_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__openclaw_local_overrides_runtime_root="$(cd "${__openclaw_local_overrides_bootstrap_dir}/.." && pwd)"
__openclaw_local_overrides_repo_root="$(cd "${__openclaw_local_overrides_runtime_root}/.." && pwd)"
__openclaw_local_overrides_home="$(cd "${__openclaw_local_overrides_repo_root}/.." && pwd)"
__openclaw_local_overrides_preload_path="${__openclaw_local_overrides_bootstrap_dir}/node-preload-entry.mjs"
__openclaw_local_overrides_log_dir="${OPENCLAW_LOCAL_OVERRIDES_LOG_DIR:-${__openclaw_local_overrides_home}/logs/local-overrides}"
__openclaw_local_overrides_runtime_log_path="${__openclaw_local_overrides_log_dir}/runtime.log"

_openclaw_local_overrides_log() {
  local event="$1"
  shift || true

  # 统一入口自己的日志只写到 `runtime.log`。
  # 模块级日志由 Node preload 层再分发到各自文件。
  mkdir -p "$(dirname "${__openclaw_local_overrides_runtime_log_path}")" 2>/dev/null || true

  printf '{"time":"%s","source":"bootstrap.bash-init","event":"%s","pid":%s,"args":"%s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "${event}" \
    "$$" \
    "$*" >> "${__openclaw_local_overrides_runtime_log_path}" 2>/dev/null || true
}

_openclaw_local_overrides_resolve_real_bin() {
  # 这里故意用 `type -P`，确保拿到 PATH 中真实的可执行文件，
  # 而不是当前 shell 里已经定义的同名 function。
  type -P openclaw 2>/dev/null || true
}

__OPENCLAW_LOCAL_OVERRIDES_REAL_BIN="$(_openclaw_local_overrides_resolve_real_bin)"

_openclaw_local_overrides_build_node_options() {
  # 统一入口始终通过 `NODE_OPTIONS=--import=...` 注入 Node preload。
  #
  # 这里必须保留已有 `NODE_OPTIONS`，否则可能破坏用户自己的 Node 调试参数。
  # 同时也要避免重复追加相同的 `--import`。
  local import_flag="--import=${__openclaw_local_overrides_preload_path}"
  local current="${NODE_OPTIONS:-}"

  if [[ " ${current} " == *" ${import_flag} "* ]]; then
    printf '%s' "${current}"
    return 0
  fi

  if [[ -n "${current}" ]]; then
    printf '%s %s' "${current}" "${import_flag}"
  else
    printf '%s' "${import_flag}"
  fi
}

openclaw() {
  # 这是整个仓库的唯一 shell 接管点。
  #
  # 设计上它不理解任何具体模块，只做三件事：
  # 1. 解析真实 `openclaw` 二进制
  # 2. 给当前这次命令注入统一 preload
  # 3. 把仓库根、日志目录等运行时上下文透传给 Node 层
  local real_bin="${__OPENCLAW_LOCAL_OVERRIDES_REAL_BIN}"

  if [[ -z "${real_bin}" || ! -x "${real_bin}" ]]; then
    _openclaw_local_overrides_log "real_bin_missing" "$*"
    printf 'openclaw wrapper error: real binary not found\n' >&2
    return 127
  fi

  if [[ "${OPENCLAW_LOCAL_OVERRIDES_DISABLE:-}" == "1" ]]; then
    # 提供全局逃生开关，便于用户在排查问题时一键绕过整个 override 框架。
    command "${real_bin}" "$@"
    return $?
  fi

  local node_options
  node_options="$(_openclaw_local_overrides_build_node_options)"

  _openclaw_local_overrides_log "inject_preload" "$*"

  # 注意这里不做模块匹配。
  # 无论 `openclaw` 执行什么子命令，统一入口都注入同一个 preload。
  # 真正的模块匹配和激活逻辑放在 `bootstrap/node-preload-entry.mjs`，
  # 这样 shell 侧就始终保持最薄的一层。
  NODE_OPTIONS="${node_options}" \
  OPENCLAW_LOCAL_OVERRIDES_HOME="${__openclaw_local_overrides_home}" \
  OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT="${__openclaw_local_overrides_repo_root}" \
  OPENCLAW_LOCAL_OVERRIDES_RUNTIME_ROOT="${__openclaw_local_overrides_runtime_root}" \
  OPENCLAW_LOCAL_OVERRIDES_LOG_DIR="${__openclaw_local_overrides_log_dir}" \
  command "${real_bin}" "$@"
}
