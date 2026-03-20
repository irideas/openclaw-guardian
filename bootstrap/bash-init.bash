# 这是 `local-overrides` 的统一 Bash 接入入口。
#
# 设计目标：
# 1. `~/.bash_profile` 里永远只保留这一条 `source`
# 2. 所有覆盖模块共用同一种接入方式
# 3. 具体模块的匹配与执行留给统一的 Node preload 路由层
#
# 当前实现中，这个入口会给所有 `openclaw` 命令统一注入：
# `NODE_OPTIONS=--import=<repo>/bootstrap/node-preload-entry.mjs`
#
# 然后由 `node-preload-entry.mjs` 自己判断：
# - 当前命令是否命中某个模块
# - 哪些模块需要真正激活

if [[ -n "${__OPENCLAW_LOCAL_OVERRIDES_BOOTSTRAP_LOADED:-}" ]]; then
  return 0
fi
__OPENCLAW_LOCAL_OVERRIDES_BOOTSTRAP_LOADED=1

__openclaw_local_overrides_bootstrap_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
__openclaw_local_overrides_repo_root="$(cd "${__openclaw_local_overrides_bootstrap_dir}/.." && pwd)"
__openclaw_local_overrides_home="$(cd "${__openclaw_local_overrides_repo_root}/.." && pwd)"
__openclaw_local_overrides_preload_path="${__openclaw_local_overrides_bootstrap_dir}/node-preload-entry.mjs"
__openclaw_local_overrides_runtime_log_path="${__openclaw_local_overrides_home}/logs/local-overrides/runtime.log"

_openclaw_local_overrides_log() {
  local event="$1"
  shift || true

  mkdir -p "$(dirname "${__openclaw_local_overrides_runtime_log_path}")" 2>/dev/null || true

  printf '{"time":"%s","source":"bootstrap.bash-init","event":"%s","pid":%s,"args":"%s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "${event}" \
    "$$" \
    "$*" >> "${__openclaw_local_overrides_runtime_log_path}" 2>/dev/null || true
}

_openclaw_local_overrides_resolve_real_bin() {
  type -P openclaw 2>/dev/null || true
}

__OPENCLAW_LOCAL_OVERRIDES_REAL_BIN="$(_openclaw_local_overrides_resolve_real_bin)"

_openclaw_local_overrides_build_node_options() {
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
  local real_bin="${__OPENCLAW_LOCAL_OVERRIDES_REAL_BIN}"

  if [[ -z "${real_bin}" || ! -x "${real_bin}" ]]; then
    _openclaw_local_overrides_log "real_bin_missing" "$*"
    printf 'openclaw wrapper error: real binary not found\n' >&2
    return 127
  fi

  if [[ "${OPENCLAW_LOCAL_OVERRIDES_DISABLE:-}" == "1" ]]; then
    command "${real_bin}" "$@"
    return $?
  fi

  local node_options
  node_options="$(_openclaw_local_overrides_build_node_options)"

  _openclaw_local_overrides_log "inject_preload" "$*"

  NODE_OPTIONS="${node_options}" \
  OPENCLAW_LOCAL_OVERRIDES_HOME="${__openclaw_local_overrides_home}" \
  OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT="${__openclaw_local_overrides_repo_root}" \
  command "${real_bin}" "$@"
}

