-- Darwin IDE — window focus behavior
--
-- Terminal windows → TERMINAL mode on focus
-- Regular editor windows → INSERT mode on focus
--
-- This is intentionally different from vim's NORMAL-mode default.
-- It matches the expectations of modern IDE users and is the primary
-- interaction model for Darwin-IDE.

local group = vim.api.nvim_create_augroup("DarwinFocus", { clear = true })

vim.api.nvim_create_autocmd("WinEnter", {
  group = group,
  pattern = "*",
  callback = function()
    local buftype = vim.bo.buftype
    local filetype = vim.bo.filetype

    -- Terminal buffers: always enter TERMINAL mode
    if buftype == "terminal" or filetype == "terminal" then
      -- Only startinsert if we're not already in terminal mode
      if vim.fn.mode() ~= "t" then
        vim.cmd("startinsert")
      end
      return
    end

    -- Regular editor buffers: enter INSERT mode
    -- (skip if already in insert mode)
    if vim.fn.mode() == "n" then
      vim.cmd("startinsert")
    end
  end,
})
