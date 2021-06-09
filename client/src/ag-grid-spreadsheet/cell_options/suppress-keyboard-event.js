export function suppressKeyboardEvent(params) {
  const context = params.context;

  // define some handy keycode constants
  const KEY_TAB = 9;
  const KEY_ENTER = 13;
  const KEY_LEFT = 37;
  const KEY_UP = 38;
  const KEY_RIGHT = 39;
  const KEY_DOWN = 40;

  if (params.event.which === KEY_ENTER || params.event.keyCode === KEY_ENTER ||
    params.event.which === KEY_TAB || params.event.keyCode === KEY_TAB) {
    params.editing = false;
    context.setClickedEdit(false);
  } else {
    if (params.event.which === KEY_LEFT || params.event.keyCode === KEY_LEFT ||
      params.event.which === KEY_UP || params.event.keyCode === KEY_UP ||
      params.event.which === KEY_RIGHT || params.event.keyCode === KEY_RIGHT ||
      params.event.which === KEY_DOWN || params.event.keyCode === KEY_DOWN) {
      if (!context.getClickedEdit()) {
        params.editing = false;
        context.setClickedEdit(false);
      } else {
        if (params.editing) {
          return true;
        }
      }
    } else {
      if (params.editing) {
        return true;
      }
    }
  }
}