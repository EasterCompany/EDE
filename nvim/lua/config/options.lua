-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- Use absolute line numbers instead of relative
vim.opt.relativenumber = false
vim.opt.number = true

-- Set the global statusline background and thin top border
vim.cmd([[
  highlight StatusLine guibg=#000000 guifg=#888888 gui=NONE
  highlight StatusLineNC guibg=#000000 guifg=#444444 gui=NONE
  highlight WinSeparator guibg=NONE guifg=#333333
  highlight DarwinHotKey guifg=#ff9e64 gui=bold
  highlight DarwinAction guifg=#7aa2f7 gui=italic
]])
