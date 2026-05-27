-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/EasterCompany/EDE/blob/main/nvim/lua/config/options.lua
-- Add any additional options here

-- Use absolute line numbers instead of relative
vim.opt.relativenumber = false
vim.opt.number = true

-- Sync default yank register with system clipboard (CLIPBOARD selection)
-- so ctrl+shift+v pastes what was yanked in neovim and vice versa.
vim.opt.clipboard = "unnamedplus"

-- Set the global statusline background and thin top border
-- Note: Setting backgrounds to NONE allows Windows Terminal scaling gaps
-- to blend seamlessly into the terminal background color instead of showing a black border.
vim.cmd([[
  highlight Normal guibg=NONE ctermbg=NONE
  highlight NormalNC guibg=NONE ctermbg=NONE
  highlight LineNr guibg=NONE ctermbg=NONE
  highlight SignColumn guibg=NONE ctermbg=NONE
  highlight EndOfBuffer guibg=NONE ctermbg=NONE
  highlight StatusLine guibg=NONE guifg=#888888 gui=NONE
  highlight StatusLineNC guibg=NONE guifg=#444444 gui=NONE
  highlight WinSeparator guibg=NONE guifg=#333333
  highlight DarwinHotKey guifg=#ff9e64 gui=bold
  highlight DarwinAction guifg=#7aa2f7 gui=italic
]])
