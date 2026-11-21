import { useId, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useRequest } from './Admin.jsx';
import { Badge, EmptyState, Icon, LoadingState, PageHeading, useToast } from './ui.jsx';

const difficulties = ['EASY', 'MEDIUM', 'HARD'];
const secondary = 'button-secondary';
const tableCell = 'p-3 align-top';
const errorText = (error) => error.response?.data?.message ?? 'Could not reach the server. Try again.';

function Feedback({ error, id }) {
  return error ? <p id={id} className="inline-alert" role="alert">{error}</p> : null;
}

function Pending({ error }) {
  return <LoadingState error={error} />;
}

function Table({ headings, children }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={headings.join(", ")}>
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100"><tr>{headings.map((heading) => <th scope="col" className={tableCell} key={heading}>{heading}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{children}</tbody>
      </table>
    </div>
  );
}

export function Categories({ api }) {
  const [state, setState] = useRequest(api, '/categories');
  const [editing, setEditing] = useState(null);
  const notify = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!state.data) return <Pending error={state.error} />;
  const { categories } = state.data;

  function select(category) {
    setEditing(category?.id ?? null);
    setName(category?.name ?? '');
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = { name: name.trim() };
      const { data: { category } } = editing
        ? await api.patch('/categories/' + editing, payload)
        : await api.post('/categories', payload);
      const updated = categories.filter(({ id }) => id !== category.id).concat(category);
      updated.sort((a, b) => a.name.localeCompare(b.name));
      setState({ data: { categories: updated } });
      select();
      notify(editing ? 'Category updated.' : 'Category added.');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(category) {
    if (!window.confirm('Delete the category “' + category.name + '”?')) return;
    setBusy(true);
    setError('');
    try {
      await api.delete('/categories/' + category.id);
      setState({ data: { categories: categories.filter(({ id }) => id !== category.id) } });
      if (editing === category.id) select();
      notify("Category deleted.");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeading title="Categories" description="Organize quizzes by topic so students can find relevant assessments." />
      <form className="card max-w-lg space-y-3" onSubmit={save}>
        <h2 className="font-semibold">{editing ? 'Edit category' : 'Add category'}</h2>
        <label className="block text-sm">Category name
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? "category-error" : undefined} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="button" disabled={busy}>{busy ? 'Working…' : editing ? 'Save category' : 'Add category'}</button>
          {editing && <button type="button" className={secondary} onClick={() => select()} disabled={busy}>Cancel</button>}
        </div>
        <Feedback error={error} id="category-error" />
      </form>
      {categories.length ? (
        <Table headings={['Category', 'Quizzes', 'Actions']}>
          {categories.map((category) => (
            <tr key={category.id}>
              <td className={tableCell}>{category.name}</td>
              <td className={tableCell}><Link to={'/admin/quizzes?categoryId=' + category.id}>View quizzes</Link></td>
              <td className={tableCell}>
                <div className="flex flex-wrap gap-2">
                  <button className={secondary} onClick={() => select(category)} disabled={busy}>Edit</button>
                  <button className={secondary} onClick={() => remove(category)} disabled={busy}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : <EmptyState icon="category">No categories have been created yet.</EmptyState>}
    </div>
  );
}

export function QuizList({ api }) {
  const [params, setParams] = useSearchParams();
  const categoryId = params.get('categoryId') ?? '';
  const search = params.get('search') ?? '';
  const [state] = useRequest(api, '/quizzes', params.toString());
  const [categories] = useRequest(api, '/categories');
  return (
    <div className="space-y-5">
      <PageHeading title="Quizzes" description="Create assessments, manage questions, and control when quizzes are visible."
        action={<Link className="button" to="/admin/quizzes/new"><Icon name="plus" size={17} />Create quiz</Link>} />
      <form className="card grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={params.toString()}
        onSubmit={(event) => {
          event.preventDefault();
          const filters = new URLSearchParams();
          for (const [key, value] of new FormData(event.currentTarget)) if (value.trim()) filters.set(key, value.trim());
          setParams(filters);
        }}>
        <label className="text-sm">Search quizzes<input name="search" defaultValue={search} maxLength={120} /></label>
        <label className="text-sm">Category
          <select name="categoryId" defaultValue={categoryId} disabled={!categories.data} onChange={(event) => {
            const next = new URLSearchParams(params);
            const value = event.target.value;
            if (value) next.set('categoryId', value);
            else next.delete('categoryId');
            const term = new FormData(event.currentTarget.form).get('search').trim();
            if (term) next.set('search', term);
            else next.delete('search');
            setParams(next);
          }}>
            <option value="">All categories</option>
            {categories.data?.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="button">Apply filters</button>
          {params.size > 0 && <Link className="button-secondary" to="/admin/quizzes">Clear</Link>}
        </div>
      </form>
      {categories.error && <Feedback error={categories.error} />}
      {!state.data ? <Pending error={state.error} /> : state.data.quizzes.length ? (
        <Table headings={['Quiz', 'Category', 'Status', 'Questions', 'Duration']}>
          {state.data.quizzes.map((quiz) => (
            <tr key={quiz.id}>
              <td className={tableCell}><Link to={'/admin/quizzes/' + quiz.id}>{quiz.title}</Link></td>
              <td className={tableCell}>{quiz.category.name}</td>
              <td className={tableCell}><Badge>{labelStatus(quiz.status)}</Badge></td>
              <td className={tableCell}>{quiz._count.questions}</td>
              <td className={tableCell}>{quiz.durationMinutes} min</td>
            </tr>
          ))}
        </Table>
      ) : <EmptyState action={params.size ? <Link to="/admin/quizzes">Clear filters</Link> : <Link to="/admin/quizzes/new">Create quiz</Link>}>{params.size ? "No quizzes match your filters." : "No quizzes have been created yet."}</EmptyState>}
    </div>
  );
}

function labelStatus(value) {
  return value[0] + value.slice(1).toLowerCase();
}

function DifficultyField({ register }) {
  const id = useId();
  return <div className="text-sm"><label htmlFor={id}>Difficulty</label><select id={id} {...register('difficulty')}>{difficulties.map((value) =>
    <option value={value} key={value}>{labelStatus(value)}</option>)}</select></div>;
}

function QuizForm({ api, quiz, categories, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      title: quiz?.title ?? '', description: quiz?.description ?? '', categoryId: quiz?.categoryId ?? categories[0].id,
      difficulty: quiz?.difficulty ?? 'EASY', durationMinutes: quiz?.durationMinutes ?? 15,
      passingPercent: quiz?.passingPercent ?? 60, maxAttempts: quiz?.maxAttempts ?? 2, thumbnailUrl: quiz?.thumbnailUrl ?? '',
    },
  });
  const [error, setError] = useState('');
  const notify = useToast();
  async function save(values) {
    setError('');
    try {
      const payload = { ...values, thumbnailUrl: values.thumbnailUrl.trim() || null };
      const { data } = quiz ? await api.patch('/quizzes/' + quiz.id, payload) : await api.post('/quizzes', payload);
      notify(quiz ? "Quiz updated." : "Quiz draft created.");
      onSave(data.quiz);
    } catch (error) {
      setError(errorText(error));
    }
  }
  return (
    <form className="card max-w-3xl space-y-4" onSubmit={handleSubmit(save)}>
      <label className="block text-sm">Title<input {...register('title')} required minLength={2} maxLength={120} /></label>
      <label className="block text-sm">Description<textarea {...register('description')} required maxLength={2000} rows={3} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-sm">
          <label htmlFor="quiz-category">Category</label>
          <select id="quiz-category" {...register('categoryId')}>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
        </div>
        <DifficultyField register={register} />
        <label className="block text-sm">Duration in minutes<input type="number" min={1} max={240} required {...register('durationMinutes', { valueAsNumber: true })} /></label>
        <label className="block text-sm">Passing percentage<input type="number" min={0} max={100} required {...register('passingPercent', { valueAsNumber: true })} /></label>
        <label className="block text-sm">Maximum attempts<input type="number" min={1} max={20} required {...register('maxAttempts', { valueAsNumber: true })} /></label>
        <label className="block text-sm">Thumbnail URL (optional)<input type="url" maxLength={2048} {...register('thumbnailUrl')} /></label>
      </div>
      <Feedback error={error} />
      <div className="flex flex-wrap gap-2">
        <button className="button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : quiz ? 'Save quiz' : 'Create draft'}</button>
        {onCancel && <button type="button" className={secondary} disabled={isSubmitting} onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export function NewQuiz({ api }) {
  const [state] = useRequest(api, '/categories');
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <Link to="/admin/quizzes">All quizzes</Link>
      <PageHeading title="Create quiz" description="Set the assessment details first, then add questions and publish." />
      {!state.data ? <Pending error={state.error} /> : state.data.categories.length ?
        <QuizForm api={api} categories={state.data.categories} onSave={(quiz) => navigate('/admin/quizzes/' + quiz.id, { replace: true })} />
        : <p><Link to="/admin/categories">Create a category</Link> before adding a quiz.</p>}
    </div>
  );
}

export function QuizEditor({ api }) {
  const { id } = useParams();
  const path = '/quizzes/' + id;
  const [state, setState] = useRequest(api, path);
  const [categories] = useRequest(api, '/categories');
  const [questions, setQuestions] = useRequest(api, path + '/questions');
  const [editing, setEditing] = useState(false);
  const [questionEditor, setQuestionEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const notify = useToast();

  if (!state.data) return <Pending error={state.error} />;
  const { quiz } = state.data;
  const published = quiz.status === 'PUBLISHED';

  async function changeQuiz(archive) {
    if (archive && !window.confirm('Archive “' + quiz.title + '”? It will disappear from the quiz list.')) return;
    setBusy(true);
    setError('');
    try {
      if (archive) {
        await api.delete(path);
        notify('Quiz archived.');
        navigate('/admin/quizzes', { replace: true });
      } else {
        const { data } = await api.post(path + '/publish', { published: !published });
        setState({ data });
        notify(published ? 'Quiz unpublished.' : 'Quiz published.');
      }
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function setQuestionList(updated) {
    setQuestions({ data: { questions: updated } });
    setState({ data: { quiz: { ...quiz, _count: { questions: updated.length } } } });
    setQuestionEditor(null);
  }

  async function removeQuestion(question) {
    if (!window.confirm('Delete this question and its options?')) return;
    setBusy(true);
    setError('');
    try {
      await api.delete('/questions/' + question.id);
      setQuestionList(questions.data.questions.filter(({ id }) => id !== question.id));
      notify("Question deleted.");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/admin/quizzes">All quizzes</Link>
      <div>
        <PageHeading title={quiz.title} />
        <p className="mt-2 text-sm text-slate-600"><Badge>{labelStatus(quiz.status)}</Badge> <Badge tone="blue">{quiz.category.name}</Badge></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="button" disabled={busy || editing || !!questionEditor} onClick={() => changeQuiz(false)}>{busy ? 'Working…' : published ? 'Unpublish quiz' : 'Publish quiz'}</button>
        {!published && !editing && <button className={secondary} disabled={busy || !!questionEditor} onClick={() => setEditing(true)}>Edit quiz</button>}
        <button className={secondary} disabled={busy || editing || !!questionEditor} onClick={() => changeQuiz(true)}>Archive quiz</button>
      </div>
      <Feedback error={error} />
      {editing ? (categories.data ? <QuizForm api={api} quiz={quiz} categories={categories.data.categories}
        onSave={(updated) => { setState({ data: { quiz: updated } }); setEditing(false); }} onCancel={() => setEditing(false)} />
        : <div><Pending error={categories.error} /><button className={secondary} onClick={() => setEditing(false)}>Cancel</button></div>) : (
        <section className="card max-w-3xl space-y-3" aria-label="Quiz details">
          <p className="whitespace-pre-wrap break-words">{quiz.description}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries({ Difficulty: labelStatus(quiz.difficulty), Duration: quiz.durationMinutes + ' min',
              'Passing score': quiz.passingPercent + '%', 'Maximum attempts': quiz.maxAttempts }).map(([label, value]) =>
              <div key={label}><dt className="text-slate-600">{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {quiz.thumbnailUrl && <a href={quiz.thumbnailUrl} target="_blank" rel="noreferrer">View thumbnail</a>}
        </section>
      )}
      <section className="space-y-4" aria-labelledby="quiz-questions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="quiz-questions" className="text-xl font-semibold">Questions ({quiz._count.questions})</h2>
          {!published && !questionEditor && questions.data && <button className="button" disabled={busy || editing} onClick={() => setQuestionEditor('new')}>Add question</button>}
        </div>
        {published && <p className="text-sm text-slate-600">Unpublish this quiz to edit its content.</p>}
        {questionEditor === 'new' && <QuestionForm api={api} path={path} onCancel={() => setQuestionEditor(null)}
          onSave={(saved) => setQuestionList([...questions.data.questions, saved])} />}
        {!questions.data ? <Pending error={questions.error} /> : questions.data.questions.length ? (
          <ol className="space-y-3">
            {questions.data.questions.map((question) => (
              <li className="card space-y-3" key={question.id}>
                {questionEditor === question.id ? <QuestionForm api={api} path={path} question={question} onCancel={() => setQuestionEditor(null)}
                  onSave={(saved) => setQuestionList(questions.data.questions.map((item) => item.id === saved.id ? saved : item))} /> : (
                  <>
                    <h3 className="break-words font-medium">{question.text}</h3>
                    <p className="text-sm text-slate-600">{labelStatus(question.difficulty)} · {question.marks} marks</p>
                    <ul className="space-y-1 pl-5 text-sm">
                      {question.options.map((option) => <li className="list-disc break-words" key={option.id}>{option.text}{option.isCorrect && <strong className="ml-2 text-teal-800">Correct</strong>}</li>)}
                    </ul>
                    <p className="break-words text-sm"><strong>Explanation</strong> {question.explanation}</p>
                    {!published && <div className="flex flex-wrap gap-2">
                      <button className={secondary} disabled={busy || editing || !!questionEditor} onClick={() => setQuestionEditor(question.id)}>Edit question</button>
                      <button className={secondary} disabled={busy || editing || !!questionEditor} onClick={() => removeQuestion(question)}>Delete question</button>
                    </div>}
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : <EmptyState icon="question">No questions have been added to this quiz yet.</EmptyState>}
      </section>
    </div>
  );
}

function QuestionForm({ api, path, question, onCancel, onSave }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { text: question?.text ?? '', explanation: question?.explanation ?? '',
      marks: question?.marks ?? 1, difficulty: question?.difficulty ?? 'EASY' },
  });
  const [options, setOptions] = useState(() => question?.options.map(({ text }, index) => ({ key: index, text })) ?? [
    { key: 0, text: '' }, { key: 1, text: '' },
  ]);
  const [nextKey, setNextKey] = useState(options.length);
  const [correct, setCorrect] = useState(question?.options.findIndex(({ isCorrect }) => isCorrect) ?? null);
  const notify = useToast();
  const [error, setError] = useState('');

  async function save(values) {
    setError('');
    if (!options.some(({ key }) => key === correct)) {
      setError('Choose one correct option.');
      return;
    }
    try {
      const payload = { ...values, options: options.map(({ key, text }) => ({ text, isCorrect: key === correct })) };
      const { data } = question ? await api.patch('/questions/' + question.id, payload)
        : await api.post(path + '/questions', payload);
      notify(question ? "Question updated." : "Question added.");
      onSave(data.question);
    } catch (error) {
      setError(errorText(error));
    }
  }

  return (
    <form className="card max-w-3xl space-y-4" onSubmit={handleSubmit(save)}>
      <h3 className="font-semibold">{question ? 'Edit question' : 'Add question'}</h3>
      <label className="block text-sm">Question text<textarea {...register('text')} required maxLength={1000} rows={2} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <DifficultyField register={register} />
        <label className="block text-sm">Marks<input {...register('marks', { valueAsNumber: true })} type="number" min={1} max={100} required /></label>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Options</legend>
        <p className="text-sm text-slate-600">Select the one correct answer.</p>
        {options.map((option, index) => (
          <div key={option.key} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
            <label className="min-w-40 flex-1 text-sm">Option {index + 1}
              <input value={option.text} required maxLength={350} onChange={(event) => setOptions(options.map((item) =>
                item.key === option.key ? { ...item, text: event.target.value } : item))} />
            </label>
            <label className="flex items-center gap-2 py-2 text-sm">
              <input className="radio" type="radio" name="correctOption" checked={correct === option.key} onChange={() => setCorrect(option.key)} />
              <span>Correct<span className="sr-only"> option {index + 1}</span></span>
            </label>
            {options.length > 2 && <button className={secondary} type="button" disabled={isSubmitting} onClick={() => {
              setOptions(options.filter(({ key }) => key !== option.key));
              if (correct === option.key) setCorrect(null);
            }}>Remove<span className="sr-only"> option {index + 1}</span></button>}
          </div>
        ))}
        {options.length < 6 && <button type="button" className={secondary} disabled={isSubmitting} onClick={() => {
          setOptions([...options, { key: nextKey, text: '' }]);
          setNextKey(nextKey + 1);
        }}>Add option</button>}
      </fieldset>
      <label className="block text-sm">Explanation<textarea {...register('explanation')} required maxLength={1500} rows={2} /></label>
      <Feedback error={error} />
      <div className="flex flex-wrap gap-2">
        <button className="button" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save question'}</button>
        <button type="button" className={secondary} disabled={isSubmitting} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
