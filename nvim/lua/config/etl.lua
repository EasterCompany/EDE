local M = {}

local etl_buf = nil
local etl_prev_buf = nil

local function find_main_win()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local cfg = vim.api.nvim_win_get_config(win)
    if cfg.relative == "" and vim.api.nvim_win_get_width(win) > (vim.o.columns / 2) then
      return win
    end
  end
  return vim.api.nvim_get_current_win()
end

local function buf_alive()
  return etl_buf and vim.api.nvim_buf_is_valid(etl_buf)
end

local function is_visible()
  if not buf_alive() then return false, nil end
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    if vim.api.nvim_win_get_buf(win) == etl_buf then
      return true, win
    end
  end
  return false, nil
end

function M.toggle()
  local visible, win = is_visible()

  -- If ETL is currently shown in the main window, toggle it off
  if visible then
    local restore = etl_prev_buf
    if restore and vim.api.nvim_buf_is_valid(restore) and restore ~= etl_buf then
      vim.api.nvim_win_set_buf(win, restore)
    else
      vim.cmd("enew")
    end
    return
  end

  local main_win = find_main_win()
  etl_prev_buf = vim.api.nvim_win_get_buf(main_win)

  -- Reuse existing buffer if the process is still alive
  if buf_alive() then
    vim.api.nvim_win_set_buf(main_win, etl_buf)
    vim.api.nvim_set_current_win(main_win)
    vim.cmd("startinsert")
    return
  end

  -- Create a new terminal buffer
  etl_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(main_win, etl_buf)
  vim.api.nvim_set_current_win(main_win)

  vim.fn.termopen("etl-tui", {
    on_exit = function()
      -- Restore previous buffer when the TUI exits
      vim.schedule(function()
        for _, w in ipairs(vim.api.nvim_list_wins()) do
          if vim.api.nvim_buf_is_valid(etl_buf or -1)
            and vim.api.nvim_win_get_buf(w) == etl_buf then
            local restore = etl_prev_buf
            if restore and vim.api.nvim_buf_is_valid(restore) then
              vim.api.nvim_win_set_buf(w, restore)
            else
              vim.cmd("enew")
            end
          end
        end
        etl_buf = nil
      end)
    end,
  })

  vim.cmd("startinsert")
end

return M
