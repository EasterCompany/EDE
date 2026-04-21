vim.api.nvim_create_autocmd("User", {
  pattern = "EDEStarted",
  callback = function()
    vim.defer_fn(function()
      local wins = vim.api.nvim_list_wins()
      for _, w in ipairs(wins) do
        local b = vim.api.nvim_win_get_buf(w)
        local ft = vim.api.nvim_get_option_value("filetype", { buf = b })
        local name = vim.api.nvim_buf_get_name(b)
        print("WIN:", w, "FT:", ft, "NAME:", name)
      end
      vim.cmd("qa!")
    end, 3000)
  end,
})
