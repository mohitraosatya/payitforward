import { Outlet, NavLink } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app">
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand">
          🌳 Pay It Forward
        </NavLink>
        <ul className="nav-links">
          <li>
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/request" className={({ isActive }) => (isActive ? 'active' : '')}>
              Request Help
            </NavLink>
          </li>
          <li>
            <NavLink to="/help" className={({ isActive }) => (isActive ? 'active' : '')}>
              Help People
            </NavLink>
          </li>
          <li>
            <NavLink to="/tree" className={({ isActive }) => (isActive ? 'active' : '')}>
              View Tree
            </NavLink>
          </li>
        </ul>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="footer">
        <p>Pay It Forward — kindness grows exponentially.</p>
      </footer>
    </div>
  );
}
