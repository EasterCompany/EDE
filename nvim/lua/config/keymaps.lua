-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/EasterCompany/EDE/blob/main/nvim/lua/config/keymaps.lua
-- Add any additional keymaps here

local function close_all_sidebars()
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

  -- Grug-far (Search & Replace)
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.bo[buf].filetype == "grug-far" then
      vim.api.nvim_win_close(win, true)
    end
  end
end

-- Global keymap for Snacks file explorer
vim.keymap.set({ "n", "t" }, "<C-e>", function()
  local explorer = Snacks.picker.get({ source = "explorer" })[1]
  if explorer and not explorer.closed and explorer:is_focused() then
    explorer:close()
  else
    Snacks.picker.explorer({
      layout = {
        preset = "vscode",
        preview = "main",
        position = "float",
      },
      jump = { close = true },
    })
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
    -- Ensure all other sidebars (Explorer, Standard Terminal, Grug-far) are closed
    -- before opening Pi.
    close_all_sidebars()

    -- Now proceed to open Pi.
    if term and term:valid() then
      -- Pi terminal exists but is not focused, show and focus it.
      term:show():focus()
    else
      -- Pi terminal does not exist, create and show it.
      -- Ensure sidebar options are applied.
      Snacks.terminal.toggle(pi_cmd, { win = { position = "left", width = 0.40, bo = { buflisted = false }, wo = { winbar = '', statusline = '', winfixwidth = true } }, interactive = true })
    end
  end
end, { noremap = true, silent = true, desc = "Pi CLI" })

-- Global keymap for Standard Terminal
local function toggle_terminal()
  local term = Snacks.terminal.get(nil, { create = false })
  if term and term:valid() and vim.api.nvim_get_current_buf() == term.buf then
    term:hide()
  else
    close_all_sidebars()
    Snacks.terminal.toggle(nil, { win = { position = "left", width = 0.40, bo = { buflisted = false }, wo = { winbar = '', statusline = '', winfixwidth = true } } })
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

-- Global keymap for Grug-far (Search & Replace) on the RIGHT
vim.keymap.set("n", "<leader>sr", function()
  local grug = require("grug-far")
  local existing_win = nil
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.bo[buf].filetype == "grug-far" then
      existing_win = win
      break
    end
  end

  if existing_win then
    vim.api.nvim_win_close(existing_win, true)
  else
    close_all_sidebars()
    grug.open({
      windowCreationCommand = "botright vsplit",
      prefills = {
        paths = vim.fn.expand("%"),
      },
    })
    vim.api.nvim_win_set_width(0, math.floor(vim.o.columns * 0.40))
    vim.wo.winfixwidth = true
  end
end, { desc = "Darwin: Search & Replace (Right Sidebar)" })

-- Jump-to-file hotkeys for monitor context
vim.keymap.set("n", "<leader>fr", function()
  local monitor_ok, monitor = pcall(require, "config.monitor")
  if monitor_ok then monitor.open_last_file("read") end
end, { desc = "Darwin: Open Monitor File (Read-Only)" })

vim.keymap.set("n", "<leader>fw", function()
  local monitor_ok, monitor = pcall(require, "config.monitor")
  if monitor_ok then monitor.open_last_file("edit") end
end, { desc = "Darwin: Open Monitor File (Edit)" })

-- Global keymap for Darwin CLI: Focus and Interrupt
vim.keymap.set({ "n", "t" }, "<leader>qe", function()
  local pi_cmd = vim.fn.stdpath("config") .. "/scripts/darwin-cli.sh"
  local term = Snacks.terminal.get(pi_cmd, { create = false })

  if term and term:valid() then
    -- 1. Focus the terminal window
    term:show():focus()
    -- 2. Send Alt+Q to trigger the app.interrupt within Pi
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<A-q>", true, true, true), "n", false)
  else
    -- If not running, just open it
    close_all_sidebars()
    Snacks.terminal.toggle(pi_cmd, { win = { position = "left", width = 0.40, bo = { buflisted = false }, wo = { winbar = '', statusline = '', winfixwidth = true } }, interactive = true })
  end
end, { noremap = true, silent = true, desc = "Darwin: Focus & Interrupt" })
