# 这是 `guardian` 的统一 Bash 接入入口。
#
# 设计目标：
# 1. `~/.bash_profile` 里永远只保留这一条 `source`
# 2. 所有 issue 共用同一种接入方式
# 3. 具体 issue 的匹配与执行留给统一的 Node runtime 路由层
#
# 当前实现中，这个入口会给所有 `openclaw` 命令统一注入：
# `NODE_OPTIONS=--import=<runtime>/bootstrap/node-entry.mjs`
#
# 然后由 `node-entry.mjs` 自己判断：
# - 当前命令是否命中某个 issue
# - 哪些 issue 的 runtime 能力需要真正激活

if [[ -n "${__OPENCLAW_GUARDIAN_BOOTSTRAP_LOADED:-}" ]]; then
  return 0
fi
__OPENCLAW_GUARDIAN_BOOTSTRAP_LOADED=1

# 这里要区分“物理路径”和“运行时挂载路径”：
# 1. 物理路径
#    用来定位真实仓库目录，例如 `<repo-dir>/runtime/bootstrap`
# 2. 挂载路径
#    用来定位 `~/.openclaw/local-overrides` 以及它所在的 `~/.openclaw`
#
# 这样做的原因是：
# - Git 仓库可以 clone 到任意 `<repo-dir>`
# - 但运行时约定仍固定挂载到 `~/.openclaw/local-overrides`
# - 日志默认路径应该落到 `~/.openclaw/logs/local-overrides`
#   而不是误落到仓库父目录下
__openclaw_guardian_source_path="${BASH_SOURCE[0]}"
__openclaw_guardian_bootstrap_dir="$(cd -P "$(dirname "${__openclaw_guardian_source_path}")" && pwd)"
__openclaw_guardian_runtime_root="$(cd -P "${__openclaw_guardian_bootstrap_dir}/.." && pwd)"
__openclaw_guardian_repo_root="$(cd -P "${__openclaw_guardian_runtime_root}/.." && pwd)"
__openclaw_guardian_runtime_mount_root="$(cd "$(dirname "${__openclaw_guardian_source_path}")/.." && pwd -L)"
__openclaw_guardian_home="${OPENCLAW_GUARDIAN_HOME:-$(cd "${__openclaw_guardian_runtime_mount_root}/.." && pwd -L)}"
__openclaw_guardian_preload_path="${__openclaw_guardian_bootstrap_dir}/node-entry.mjs"
__openclaw_guardian_log_dir="${OPENCLAW_GUARDIAN_LOG_DIR:-${__openclaw_guardian_home}/logs/local-overrides}"
__openclaw_guardian_runtime_log_path="${__openclaw_guardian_log_dir}/runtime.log"

_openclaw_guardian_log() {
  local event="$1"
  shift || true

  # 统一入口自己的日志只写到 `runtime.log`。
  # issue 级日志由 Node runtime 层再分发到各自文件。
  mkdir -p "$(dirname "${__openclaw_guardian_runtime_log_path}")" 2>/dev/null || true

  printf '{"time":"%s","source":"bootstrap.bash-init","event":"%s","pid":%s,"args":"%s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "${event}" \
    "$$" \
    "$*" >> "${__openclaw_guardian_runtime_log_path}" 2>/dev/null || true
}

_openclaw_guardian_resolve_real_bin() {
  # 这里故意用 `type -P`，确保拿到 PATH 中真实的可执行文件，
  # 而不是当前 shell 里已经定义的同名 function。
  type -P openclaw 2>/dev/null || true
}

__OPENCLAW_GUARDIAN_REAL_BIN="$(_openclaw_guardian_resolve_real_bin)"

_openclaw_guardian_build_node_options() {
  # 统一入口始终通过 `NODE_OPTIONS=--import=...` 注入 Node preload。
  #
  # 这里必须保留已有 `NODE_OPTIONS`，否则可能破坏用户自己的 Node 调试参数。
  # 同时也要避免重复追加相同的 `--import`。
  local import_flag="--import=${__openclaw_guardian_preload_path}"
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
  # 设计上它不理解任何具体 issue，只做三件事：
  # 1. 解析真实 `openclaw` 二进制
  # 2. 给当前这次命令注入统一 preload
  # 3. 把仓库根、日志目录等运行时上下文透传给 Node 层
  local real_bin="${__OPENCLAW_GUARDIAN_REAL_BIN}"

  if [[ -z "${real_bin}" || ! -x "${real_bin}" ]]; then
    _openclaw_guardian_log "real_bin_missing" "$*"
    printf 'openclaw wrapper error: real binary not found\n' >&2
    return 127
  fi

  if [[ "${OPENCLAW_GUARDIAN_DISABLE:-}" == "1" ]]; then
    # 提供全局逃生开关，便于用户在排查问题时一键绕过整个 override 框架。
    command "${real_bin}" "$@"
    return $?
  fi

  local node_options
  node_options="$(_openclaw_guardian_build_node_options)"

  _openclaw_guardian_log "inject_preload" "$*"

  # 注意这里不做 issue 匹配。
  # 无论 `openclaw` 执行什么子命令，统一入口都注入同一个 preload。
  # 真正的 issue 匹配和 runtime 激活逻辑放在 `bootstrap/node-entry.mjs`，
  # 这样 shell 侧就始终保持最薄的一层。
  NODE_OPTIONS="${node_options}" \
  OPENCLAW_GUARDIAN_HOME="${__openclaw_guardian_home}" \
  OPENCLAW_GUARDIAN_REPO_ROOT="${__openclaw_guardian_repo_root}" \
  OPENCLAW_GUARDIAN_RUNTIME_ROOT="${__openclaw_guardian_runtime_root}" \
  OPENCLAW_GUARDIAN_LOG_DIR="${__openclaw_guardian_log_dir}" \
  command "${real_bin}" "$@"
}

guardian() {
  local cli_path="${__openclaw_guardian_repo_root}/cli/guardian.mjs"
  if [[ ! -f "${cli_path}" ]]; then
    _openclaw_guardian_log "guardian_cli_missing" "$*"
    printf 'guardian wrapper error: cli entry not found\n' >&2
    return 127
  fi

  OPENCLAW_GUARDIAN_HOME="${__openclaw_guardian_home}" \
  OPENCLAW_GUARDIAN_REPO_ROOT="${__openclaw_guardian_repo_root}" \
  OPENCLAW_GUARDIAN_RUNTIME_ROOT="${__openclaw_guardian_runtime_root}" \
  OPENCLAW_GUARDIAN_LOG_DIR="${__openclaw_guardian_log_dir}" \
  command node "${cli_path}" "$@"
}
