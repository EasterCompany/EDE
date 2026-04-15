return {
  {
    "akinsho/bufferline.nvim",
    opts = {
      options = {
        ---@param bufid number
        left_mouse_command = function(bufid)
          local main_win = nil
          for _, win in ipairs(vim.api.nvim_list_wins()) do
            local config = vim.api.nvim_win_get_config(win)
            -- Main win is not floating and takes up significant width
            if config.relative == "" and vim.api.nvim_win_get_width(win) > (vim.o.columns / 2) then
              main_win = win
              break
            end
          end

          if main_win then
            vim.api.nvim_set_current_win(main_win)
          end
          vim.api.nvim_set_current_buf(bufid)
        end,
      },
    },
  },
}
