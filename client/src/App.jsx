import DoctorSearch from './components/DoctorSearch.jsx';

export default function App() {
  const token = window.sessionStorage.getItem('token');

  return <DoctorSearch token={token} />;
}
