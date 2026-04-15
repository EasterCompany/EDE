local M = {}

local sync_file = "/tmp/darwin-monitor.md"
local sync_buf = nil

local darwin_art = [[
██████╗  █████╗ ██████╗ ██╗    ██╗██╗███╗   ██╗
██╔══██╗██╔══██╗██╔══██╗██║    ██║██║████╗  ██║
██║  ██║███████║██████╔╝██║ █╗ ██║██║██╔██╗ ██║
██║  ██║██╔══██║██╔══██╗██║███╗██║██║██║╚██╗██║
██████╔╝██║  ██║██║  ██║╚███╔███╔╝██║██║ ╚████║
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝

PI AGENT MONITOR
(C) EASTER COMPANY

Darwin is initializing the intelligence.
Press <C-\> to interact with the agent.
Press <C-e> to open the file explorer.
]]

local function get_monitor_buf()
  if sync_buf and vim.api.nvim_buf_is_valid(sync_buf) then
    return sync_buf
  end

  sync_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_name(sync_buf, "Agent Monitor")
  vim.api.nvim_set_option_value("buftype", "nofile", { buf = sync_buf })
  vim.api.nvim_set_option_value("filetype", "markdown", { buf = sync_buf })
  vim.api.nvim_set_option_value("bufhidden", "hide", { buf = sync_buf })
  vim.api.nvim_set_option_value("swapfile", false, { buf = sync_buf })
  return sync_buf
end

local function update_monitor_buf()
  local buf = get_monitor_buf()
  local f = io.open(sync_file, "r")
  local content = ""
  if f then
    content = f:read("*a")
    f:close()
  end

  local lines
  if content == "" or content == "\n" or content:find("Waiting for activity") then
    lines = vim.split(darwin_art, "\n")
    -- Left align with tabs
    local padding = "\t\t\t"
    for i, line in ipairs(lines) do
      if line ~= "" then
        lines[i] = padding .. line
      end
    end
    for i = 1, 5 do table.insert(lines, 1, "") end
  else
    -- Add hotkey hints at the top of the monitor view
    local header = {
      "   [ <leader>fr: Open Read-Only ]  [ <leader>fw: Open for Edit ]",
      "   ------------------------------------------------------------",
      ""
    }
    lines = vim.split(content, "\n")
    for i = #header, 1, -1 do
      table.insert(lines, 1, header[i])
    end
  end
  vim.api.nvim_set_option_value("modifiable", true, { buf = buf })
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
  
  -- Apply highlighting to the hotkeys
  vim.api.nvim_buf_clear_namespace(buf, -1, 0, -1)
  if #lines > 0 and lines[1]:find("<leader>") then
    -- Simple highlight for the top hotkey hint
    vim.api.nvim_buf_add_highlight(buf, -1, "DarwinHotKey", 0, 5, 17)
    vim.api.nvim_buf_add_highlight(buf, -1, "DarwinAction", 0, 19, 30)
    vim.api.nvim_buf_add_highlight(buf, -1, "DarwinHotKey", 0, 37, 49)
    vim.api.nvim_buf_add_highlight(buf, -1, "DarwinAction", 0, 51, 62)
  end
  
  vim.api.nvim_set_option_value("modifiable", false, { buf = buf })
end

local function setup_watcher()
  local w = vim.loop.new_fs_event()
  w:start(sync_file, {}, function(err, filename, events)
    if err then return end
    vim.schedule(function()
      -- Try to extract file path from monitor content for hotkeys
      local f = io.open(sync_file, "r")
      if f then
        local first_lines = f:read(1024) -- Read enough to find the file path
        f:close()
        if first_lines then
          local path = first_lines:match("File: `([^`]+)`")
          if path then
            _G.darwin_monitor_context.last_file = path
          end
        end
      end
      update_monitor_buf()
    end)
  end)
end

-- Jump to file actions
function M.open_last_file(mode)
  local path = _G.darwin_monitor_context.last_file
  if not path or path == "" then
    print("Darwin: No file found in monitor context")
    return
  end
  
  -- Find main window
  local main_win = nil
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local config = vim.api.nvim_win_get_config(win)
    if config.relative == "" and vim.api.nvim_win_get_width(win) > (vim.o.columns / 2) then
      main_win = win
      break
    end
  end
  
  if not main_win then main_win = vim.api.nvim_get_current_win() end
  
  vim.api.nvim_set_current_win(main_win)
  vim.cmd("edit " .. vim.fn.fnameescape(path))
  
  if mode == "read" then
    vim.bo.readonly = true
    vim.bo.modifiable = false
    print("Darwin: Opened " .. path .. " (READ-ONLY)")
  else
    vim.bo.readonly = false
    vim.bo.modifiable = true
    print("Darwin: Opened " .. path .. " (EDIT)")
  end
end

function M.show_monitor_view()
  local buf = get_monitor_buf()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    if vim.api.nvim_win_get_buf(win) == buf then
      update_monitor_buf()
      return
    end
  end

  local main_win = nil
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local config = vim.api.nvim_win_get_config(win)
    if config.relative == "" and vim.api.nvim_win_get_width(win) > (vim.o.columns / 2) then
      main_win = win
      break
    end
  end

  if not main_win then
    main_win = vim.api.nvim_get_current_win()
  end

  vim.api.nvim_win_set_buf(main_win, buf)
  update_monitor_buf()
end

-- Initialize the watcher
local f = io.open(sync_file, "a")
if f then f:close() end
setup_watcher()

return M
