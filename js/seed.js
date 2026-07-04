// Seed default data only when no saved state exists yet — never overwrite user data.
(function(){
  if (!localStorage.getItem('fire_state')) {
    localStorage.setItem('fire_state', '{"v":1,"fields":{}}');
  }
}());
