-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/EasterCompany/EDE/blob/main/nvim/lua/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `ede_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("ede_wrap_spell")

vim.api.nvim_create_autocmd("FileType", {
  pattern = "*.mojo",
  callback = function()
    vim.opt.filetype = "python"
  end,
  desc = "Set filetype to python for Mojo files",
})
