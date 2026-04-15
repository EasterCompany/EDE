-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local function close_sidebar()
  -- Explorer
  local explorer = Snacks.picker.get({ source = "explorer" })[1]
  if explorer and not explorer.closed then
    explorer:close()
  end

  -- Pi
  local pi_cmd = vim.fn.stdpath("config") .. "/scripts/darwin-cli.sh"
  local pi_term = Snacks.terminal.get(pi_cmd, { create = false })
  if pi_term and pi_term:valid() then
    pi_term:hide()
  end

  -- Standard Terminal
  local main_term = Snacks.terminal.get(nil, { create = false })
  if main_term and main_term:valid() then
    main_term:hide()
  end
end

-- Global keymap for Snacks file explorer
vim.keymap.set({ "n", "t" }, "<C-e>", function()
  local explorer = Snacks.picker.get({ source = "explorer" })[1]
  if explorer and not explorer.closed and explorer:is_focused() then
    explorer:close()
  else
    close_sidebar()
    Snacks.picker.explorer()
  end
end, { noremap = true, silent = true, desc = "Explorer" })

-- Global keymap for Pi CLI terminal
vim.keymap.set({ "n", "t" }, "<C-\\>", function()
  local pi_cmd = vim.fn.stdpath("config") .. "/scripts/darwin-cli.sh"
  local term = Snacks.terminal.get(pi_cmd, { create = false })

  if term and term:valid() and vim.api.nvim_get_current_buf() == term.buf then
    -- Pi terminal is already open and focused, so hide it.
    term:hide()
  else
    -- Pi terminal is not focused or does not exist.
    -- Ensure all other sidebars (Explorer, Standard Terminal) are closed
    -- before opening Pi.
    close_sidebar()

    -- Now proceed to open Pi.
    if term and term:valid() then
      -- Pi terminal exists but is not focused, show and focus it.
      term:show():focus()
    else
      -- Pi terminal does not exist, create and show it.
      -- Ensure sidebar options are applied.
      Snacks.terminal.toggle(pi_cmd, { win = { position = "left", width = 0.33, wo = { winbar = '', statusline = '' } }, interactive = true })
    end
  end
end, { noremap = true, silent = true, desc = "Pi CLI" })

-- Global keymap for Standard Terminal
local function toggle_terminal()
  local term = Snacks.terminal.get(nil, { create = false })
  if term and term:valid() and vim.api.nvim_get_current_buf() == term.buf then
    term:hide()
  else
    close_sidebar()
    Snacks.terminal.toggle(nil, { win = { position = "left", width = 0.33, wo = { winbar = '', statusline = '' } } })
  end
end

vim.keymap.set({ "n", "t" }, "<C-/>", toggle_terminal, { noremap = true, silent = true, desc = "Terminal" })
vim.keymap.set({ "n", "t" }, "<C-_>", toggle_terminal, { noremap = true, silent = true, desc = "which_key_ignore" })

-- Global keymap for Lazygit
vim.keymap.set({ "n", "t" }, "<leader>gg", function()
  Snacks.lazygit()
end, { noremap = true, silent = true, desc = "Lazygit" })

-- Global keymap for Pi Agent Monitor
vim.keymap.set({ "n", "t" }, "<leader>ps", function()
  local monitor_ok, monitor = pcall(require, "config.monitor")
  if monitor_ok and monitor.show_monitor_view then
    monitor.show_monitor_view()
  end
end, { noremap = true, silent = true, desc = "Agent Monitor" })
