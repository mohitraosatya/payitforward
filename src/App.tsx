import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import RequestHelp from './pages/RequestHelp';
import HelpPeople from './pages/HelpPeople';
import Tree from './pages/Tree';
import Confirm from './pages/Confirm';

// HashRouter avoids the GitHub Pages 404-on-refresh problem.
// URLs look like: https://user.github.io/payitforward/#/request
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/request" element={<RequestHelp />} />
          <Route path="/help" element={<HelpPeople />} />
          <Route path="/tree" element={<Tree />} />
          <Route path="/confirm" element={<Confirm />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
